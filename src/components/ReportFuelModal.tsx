import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Clock, User, Fuel, Loader2, Send, AlertCircle, RefreshCw, Edit3 } from "lucide-react";

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
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [isManualLocation, setIsManualLocation] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  
  // Registration states
  const [isRegistered, setIsRegistered] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [registering, setRegistering] = useState(false);
  
  const { toast } = useToast();

  // Check if user is registered
  useEffect(() => {
    const storedUserId = localStorage.getItem("fuelsync_user_id");
    const storedUserName = localStorage.getItem("fuelsync_user_name");
    const storedUserEmail = localStorage.getItem("fuelsync_user_email");
    
    if (storedUserId && storedUserName && storedUserEmail) {
      setAnonymousUserId(storedUserId);
      setUserName(storedUserName);
      setUserEmail(storedUserEmail);
      setIsRegistered(true);
    }
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
      if (!showManualEntry && !isManualLocation) {
        getUserLocation();
      }
    }
  }, [open]);

  const getUserLocation = () => {
    setLocationError("");
    setLoadingLocation(true);
    setIsManualLocation(false);
    setShowManualEntry(false);
    
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      setLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setLoadingLocation(false);
      },
      (error) => {
        setLocationError("Unable to retrieve your location. Please enable location services.");
        console.error("Geolocation error:", error);
        setLoadingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleManualLocationSubmit = () => {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      toast({
        title: "Invalid Coordinates",
        description: "Please enter valid latitude (-90 to 90) and longitude (-180 to 180)",
        variant: "destructive",
      });
      return;
    }
    
    setUserLocation({ lat, lon });
    setIsManualLocation(true);
    setShowManualEntry(false);
    setLocationError("");
  };

  const handleRegistration = async () => {
    if (!userName.trim() || !userEmail.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your name and email",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setRegistering(true);
    
    // Generate user ID
    const userId = `user_${Math.random().toString(36).substring(2, 10)}`;
    
    // Store in localStorage
    localStorage.setItem("fuelsync_user_id", userId);
    localStorage.setItem("fuelsync_user_name", userName.trim());
    localStorage.setItem("fuelsync_user_email", userEmail.trim());
    
    setAnonymousUserId(userId);
    setIsRegistered(true);
    setShowRegistration(false);
    setRegistering(false);
    
    toast({
      title: "Registration Successful",
      description: "You can now submit fuel reports!",
    });
  };

  const handleSubmit = async () => {
    if (!selectedStation || !fuelType || !userLocation) {
      toast({
        title: "Missing Information",
        description: "Please fill all fields and provide location",
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
            is_manual_location: isManualLocation,
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
        const scoreNote = isManualLocation ? " (Manual location penalty applied)" : "";
        toast({
          title: "Report Submitted Successfully",
          description: `DVE Score: ${(result.dveResult?.score * 100).toFixed(1)}%${scoreNote} - Your contribution helps verify fuel availability!`,
        });
      }

      setOpen(false);
      setSelectedStation("");
      setFuelType("");
      setIsManualLocation(false);
      setShowManualEntry(false);
      setManualLat("");
      setManualLon("");
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

  // If not registered, show registration form when trying to report
  if (open && !isRegistered) {
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
              <User className="w-5 h-5 text-primary" />
              Register to Report
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Please register before submitting fuel reports. This helps us maintain report quality and build your trust score.
            </p>

            <div className="space-y-2">
              <Label htmlFor="userName">Name</Label>
              <Input
                id="userName"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="userEmail">Email</Label>
              <Input
                id="userEmail"
                type="email"
                placeholder="Enter your email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
              />
            </div>

            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Your information is stored locally and used to track your contribution history and trust score.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegistration} disabled={registering}>
              {registering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Registering...
                </>
              ) : (
                "Register"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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

            {/* User Info */}
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">User:</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {userName || anonymousUserId}
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Location:</span>
                {userLocation ? (
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={isManualLocation ? "destructive" : "secondary"} 
                      className="font-mono text-xs"
                    >
                      {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
                    </Badge>
                    {isManualLocation && (
                      <Badge variant="outline" className="text-xs text-destructive border-destructive">
                        Manual (0.1x score)
                      </Badge>
                    )}
                  </div>
                ) : loadingLocation ? (
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Getting location...
                  </div>
                ) : locationError ? (
                  <div className="flex items-center gap-1 text-destructive text-xs">
                    <AlertCircle className="w-3 h-3" />
                    {locationError}
                  </div>
                ) : null}
              </div>

              {/* Location action buttons */}
              <div className="flex gap-2 ml-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={getUserLocation}
                  disabled={loadingLocation}
                  className="text-xs h-7"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${loadingLocation ? 'animate-spin' : ''}`} />
                  Retry Location
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualEntry(!showManualEntry)}
                  className="text-xs h-7"
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  Manual Entry
                </Button>
              </div>

              {/* Manual location entry form */}
              {showManualEntry && (
                <div className="ml-6 p-3 bg-destructive/10 border border-destructive/20 rounded-lg space-y-3">
                  <p className="text-xs text-destructive font-medium">
                    ⚠️ Manual location will reduce your DVE score to 0.1x
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Latitude</Label>
                      <Input
                        type="number"
                        step="any"
                        placeholder="e.g. 28.6139"
                        value={manualLat}
                        onChange={(e) => setManualLat(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Longitude</Label>
                      <Input
                        type="number"
                        step="any"
                        placeholder="e.g. 77.2090"
                        value={manualLon}
                        onChange={(e) => setManualLon(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={handleManualLocationSubmit}
                    className="w-full h-7 text-xs"
                  >
                    Use Manual Location (0.1x Score)
                  </Button>
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
