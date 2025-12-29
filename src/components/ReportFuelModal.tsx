import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Clock, User, Fuel, Loader2, Send, AlertCircle } from "lucide-react";

interface FuelStation {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lon: number | null;
}

const FUEL_TYPES = ["E10", "E20", "Pure Petrol", "Diesel", "CNG"] as const;

export default function ReportFuelModal() {
  const [open, setOpen] = useState(false);
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>("");
  const [fuelType, setFuelType] = useState<string>("");
  const [anonymousUserId, setAnonymousUserId] = useState<string>("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingStations, setLoadingStations] = useState(false);
  const { toast } = useToast();

  // Generate or retrieve anonymous user ID
  useEffect(() => {
    let storedId = localStorage.getItem("fuelnavigator_anonymous_id");
    if (!storedId) {
      storedId = `user_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem("fuelnavigator_anonymous_id", storedId);
    }
    setAnonymousUserId(storedId);
  }, []);

  // Load fuel stations
  useEffect(() => {
    const loadStations = async () => {
      setLoadingStations(true);
      const { data, error } = await supabase
        .from("fuel_stations")
        .select("id, name, address, lat, lon")
        .order("name");

      if (error) {
        console.error("Error loading stations:", error);
      } else {
        setStations(data || []);
      }
      setLoadingStations(false);
    };

    if (open) {
      loadStations();
      getUserLocation();
    }
  }, [open]);

  const getUserLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        setLocationError("Unable to retrieve your location. Please enable location services.");
        console.error("Geolocation error:", error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleSubmit = async () => {
    if (!selectedStation || !fuelType || !userLocation) {
      toast({
        title: "Missing Information",
        description: "Please fill all fields and enable location access",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const response = await supabase.functions.invoke("dve-process", {
        body: {
          action: "submit_report",
          report: {
            station_id: selectedStation,
            fuel_type: fuelType,
            anonymous_user_id: anonymousUserId,
            user_lat: userLocation.lat,
            user_lon: userLocation.lon,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;

      if (result.dveResult?.isRejected) {
        toast({
          title: "Report Submitted",
          description: `Your report was received but flagged: ${result.dveResult.rejectionReason}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Report Submitted Successfully",
          description: `DVE Score: ${(result.dveResult?.score * 100).toFixed(1)}% - Your contribution helps verify fuel availability!`,
        });
      }

      setOpen(false);
      setSelectedStation("");
      setFuelType("");
    } catch (error) {
      console.error("Submit error:", error);
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedStationData = stations.find((s) => s.id === selectedStation);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" variant="default">
          <Send className="w-4 h-4" />
          Report Fuel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="w-5 h-5 text-primary" />
            Report Fuel Availability
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Station Selection */}
          <div className="space-y-2">
            <Label htmlFor="station">Fuel Station</Label>
            {loadingStations ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading stations...
              </div>
            ) : (
              <Select value={selectedStation} onValueChange={setSelectedStation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a fuel station" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {stations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      {station.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedStationData && (
              <p className="text-xs text-muted-foreground truncate">
                {selectedStationData.address}
              </p>
            )}
          </div>

          {/* Fuel Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="fuelType">Fuel Type Available</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger>
                <SelectValue placeholder="Select fuel type" />
              </SelectTrigger>
              <SelectContent>
                {FUEL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-captured fields */}
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Auto-captured Data
            </p>

            {/* User ID */}
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">User ID:</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {anonymousUserId}
              </Badge>
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Timestamp:</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {new Date().toLocaleString()}
              </Badge>
            </div>

            {/* Location */}
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Location:</span>
              {userLocation ? (
                <Badge variant="secondary" className="font-mono text-xs">
                  {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
                </Badge>
              ) : locationError ? (
                <div className="flex items-center gap-1 text-destructive text-xs">
                  <AlertCircle className="w-3 h-3" />
                  {locationError}
                </div>
              ) : (
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Getting location...
                </div>
              )}
            </div>
          </div>

          {/* DVE Note */}
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong className="text-primary">Data Verification Engine (DVE):</strong> Your report will be
              validated for trust score, location proximity, and temporal relevance before being
              published on the map.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedStation || !fuelType || !userLocation}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Submit Report
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}