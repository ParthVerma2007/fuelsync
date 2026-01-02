import { useEffect, useRef, useState } from "react";
import { PumpData } from "@/data/pumpsData";
import { MapPin } from "lucide-react";
import { VerifiedFuelInfo } from "@/services/stationService";

interface MapProps {
  pumps: PumpData[];
  onPumpClick: (pump: PumpData) => void;
  selectedPump: PumpData | null;
  verifiedData?: VerifiedFuelInfo[];
}

const GEOAPIFY_API_KEY = "7467d8bd3f3549bbad82ef9853724c7b";

const Map = ({ pumps, onPumpClick, selectedPump, verifiedData = [] }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);

  useEffect(() => {
    // Load Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      if (mapContainer.current && (window as any).L) {
        const L = (window as any).L;
        
        // Center on Pune
        const newMap = L.map(mapContainer.current).setView([18.5204, 73.8567], 12);

        // Add Geoapify tiles
        L.tileLayer(
          `https://maps.geoapify.com/v1/tile/dark-matter/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_API_KEY}`,
          {
            attribution: '© <a href="https://www.geoapify.com/">Geoapify</a>',
            maxZoom: 20,
          }
        ).addTo(newMap);

        setMap(newMap);
      }
    };
    document.body.appendChild(script);

    return () => {
      if (map) {
        map.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!map || !(window as any).L) return;

    const L = (window as any).L;

    // Clear existing markers
    markers.forEach(marker => marker.remove());

    // Check if a pump has verified data
    const hasVerifiedData = (pumpId: number) => {
      return verifiedData.some(v => v.legacyId === pumpId && v.fuelTypes.length > 0);
    };

    // Create custom icon
    const createIcon = (isSelected: boolean, isVerified: boolean) => {
      const bgColor = isVerified 
        ? 'hsl(142, 76%, 36%)' // Green for verified
        : isSelected 
          ? 'hsl(210, 15%, 60%)' 
          : 'hsl(200, 20%, 50%)';
      const borderColor = isSelected ? 'hsl(220, 20%, 10%)' : 'hsl(220, 18%, 14%)';
      const glowColor = isVerified 
        ? 'hsl(142, 76%, 36%, 0.6)' 
        : isSelected 
          ? 'hsl(210, 15%, 60%, 0.6)' 
          : 'hsl(200, 20%, 50%, 0.4)';
      
      return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 32px;
          height: 32px;
          background: ${bgColor};
          border: 3px solid ${borderColor};
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 0 20px ${glowColor};
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        ">
          <div style="
            width: 12px;
            height: 12px;
            background: hsl(220, 20%, 10%);
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
          ${isVerified ? `<div style="
            position: absolute;
            top: -8px;
            right: -8px;
            width: 14px;
            height: 14px;
            background: hsl(142, 76%, 36%);
            border: 2px solid white;
            border-radius: 50%;
            transform: rotate(45deg);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <span style="transform: rotate(-45deg); color: white; font-size: 8px; font-weight: bold;">✓</span>
          </div>` : ''}
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
    };

    // Add markers for pumps with coordinates
    const newMarkers = pumps
      .filter(pump => pump.lat && pump.lon)
      .map(pump => {
        const isSelected = selectedPump?.id === pump.id;
        const isVerified = hasVerifiedData(pump.id);
        const marker = L.marker([pump.lat!, pump.lon!], {
          icon: createIcon(isSelected, isVerified)
        }).addTo(map);

        marker.on('click', () => {
          onPumpClick(pump);
        });

        return marker;
      });

    setMarkers(newMarkers);
  }, [map, pumps, selectedPump, onPumpClick, verifiedData]);

  return (
    <div 
      ref={mapContainer} 
      className="w-full h-full z-0"
      style={{ background: 'hsl(220, 15%, 8%)' }}
    />
  );
};

export default Map;
