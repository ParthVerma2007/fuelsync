import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DVE Configuration Constants (matching IEEE paper)
const DVE_CONFIG = {
  INITIAL_TRUST_SCORE: 0.5,
  TRUST_INCREMENT: 0.05,
  TRUST_DECREMENT: 0.1,
  MIN_TRUST_SCORE: 0.1,
  MAX_TRUST_SCORE: 1.0,
  TIME_DECAY_HALF_LIFE: 24,
  MAX_REPORT_AGE_HOURS: 168,
  MAX_DISTANCE_KM: 2.0,
  OPTIMAL_DISTANCE_KM: 0.5,
  MIN_REPORTS_FOR_CONSENSUS: 2,
  CONSENSUS_THRESHOLD: 0.6,
  CONSENSUS_BONUS: 0.2,
  VERIFICATION_THRESHOLD: 0.4,
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateTimeDecay(reportTimestamp: Date): number {
  const ageHours = (Date.now() - reportTimestamp.getTime()) / (1000 * 60 * 60);
  if (ageHours > DVE_CONFIG.MAX_REPORT_AGE_HOURS) return 0;
  return Math.pow(0.5, ageHours / DVE_CONFIG.TIME_DECAY_HALF_LIFE);
}

function calculateLocationFactor(userLat: number, userLon: number, stationLat: number, stationLon: number) {
  const distance = calculateDistance(userLat, userLon, stationLat, stationLon);
  if (distance > DVE_CONFIG.MAX_DISTANCE_KM) return { factor: 0, distance, isValid: false };
  if (distance <= DVE_CONFIG.OPTIMAL_DISTANCE_KM) return { factor: 1.0, distance, isValid: true };
  const factor = 1 - (distance - DVE_CONFIG.OPTIMAL_DISTANCE_KM) / (DVE_CONFIG.MAX_DISTANCE_KM - DVE_CONFIG.OPTIMAL_DISTANCE_KM);
  return { factor: Math.max(0, factor), distance, isValid: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient: any = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, report } = await req.json();

    if (action === "submit_report") {
      if (!report.station_id || !report.fuel_type || !report.anonymous_user_id || 
          report.user_lat === undefined || report.user_lon === undefined) {
        return new Response(JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: station } = await supabaseClient.from("fuel_stations")
        .select("id, lat, lon").eq("id", report.station_id).single();

      if (!station?.lat || !station?.lon) {
        return new Response(JSON.stringify({ error: "Station not found or missing coordinates" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get or create user trust score
      let { data: userTrust } = await supabaseClient.from("user_trust_scores")
        .select("*").eq("anonymous_user_id", report.anonymous_user_id).maybeSingle();

      if (!userTrust) {
        await supabaseClient.from("user_trust_scores").insert({
          anonymous_user_id: report.anonymous_user_id,
          trust_score: DVE_CONFIG.INITIAL_TRUST_SCORE,
        });
        userTrust = { trust_score: DVE_CONFIG.INITIAL_TRUST_SCORE };
      }

      const trustScore = userTrust?.trust_score ?? DVE_CONFIG.INITIAL_TRUST_SCORE;
      const timeDecay = calculateTimeDecay(new Date());
      const locationResult = calculateLocationFactor(report.user_lat, report.user_lon, station.lat, station.lon);

      let dveScore = 0, isRejected = false, rejectionReason: string | null = null;

      if (!locationResult.isValid) {
        isRejected = true;
        rejectionReason = `User too far from station (${locationResult.distance.toFixed(2)}km)`;
      } else {
        dveScore = trustScore * timeDecay * locationResult.factor;
      }

      const { data: insertedReport } = await supabaseClient.from("crowdsourced_reports").insert({
        station_id: report.station_id,
        anonymous_user_id: report.anonymous_user_id,
        fuel_type: report.fuel_type,
        user_lat: report.user_lat,
        user_lon: report.user_lon,
        trust_score_at_submission: trustScore,
        time_decay_factor: timeDecay,
        location_factor: locationResult.factor,
        dve_score: dveScore,
        is_rejected: isRejected,
        rejection_reason: rejectionReason,
      }).select().single();

      // Run consensus check
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - DVE_CONFIG.MAX_REPORT_AGE_HOURS);
      
      const { data: reports } = await supabaseClient.from("crowdsourced_reports")
        .select("*").eq("station_id", report.station_id).eq("is_rejected", false)
        .gte("timestamp", cutoffDate.toISOString());

      if (reports && reports.length >= DVE_CONFIG.MIN_REPORTS_FOR_CONSENSUS) {
        const fuelTypeReports: Record<string, any[]> = {};
        for (const r of reports) {
          if (!fuelTypeReports[r.fuel_type]) fuelTypeReports[r.fuel_type] = [];
          fuelTypeReports[r.fuel_type].push(r);
        }

        for (const [fuelType, fuelReports] of Object.entries(fuelTypeReports)) {
          const uniqueUsers = new Set(fuelReports.map((r: any) => r.anonymous_user_id)).size;
          if (uniqueUsers >= DVE_CONFIG.MIN_REPORTS_FOR_CONSENSUS) {
            const avgScore = fuelReports.reduce((sum: number, r: any) => sum + (r.dve_score || 0), 0) / fuelReports.length;
            const finalScore = Math.min(1.0, avgScore + DVE_CONFIG.CONSENSUS_BONUS);

            if (finalScore >= DVE_CONFIG.VERIFICATION_THRESHOLD) {
              await supabaseClient.from("verified_fuel_data").upsert({
                station_id: report.station_id, fuel_type: fuelType, is_available: true,
                confidence_score: finalScore, verified_by_count: uniqueUsers,
                last_verified_at: new Date().toISOString(),
              }, { onConflict: "station_id,fuel_type" });

              for (const r of fuelReports) {
                await supabaseClient.from("crowdsourced_reports").update({ is_verified: true }).eq("id", r.id);
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({
        success: true, reportId: insertedReport?.id,
        dveResult: { score: dveScore, trustScore, timeDecay, locationFactor: locationResult.factor, isRejected, rejectionReason }
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_admin_data") {
      const { data: reports } = await supabaseClient.from("crowdsourced_reports")
        .select("*, fuel_stations (name)").order("timestamp", { ascending: false }).limit(100);
      const { data: trustScores } = await supabaseClient.from("user_trust_scores").select("*");
      const { data: verifiedData } = await supabaseClient.from("verified_fuel_data").select("*, fuel_stations (name)");

      return new Response(JSON.stringify({ reports, trustScores, verifiedData, config: DVE_CONFIG }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("DVE Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});