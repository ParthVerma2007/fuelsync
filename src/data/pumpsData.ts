import petrolPumpsCSV from "./petrol-pumps.csv?raw";

export interface PumpData {
  id: number;
  pumpId: string;
  name: string;
  brand: string;
  address: string;
  review: string;
  rating: number;
  city: string;
  state: string;
  lat: number;
  lon: number;
  // Legacy fields for backward compatibility
  e20: boolean;
  e10: boolean;
  pure: boolean;
  diesel: boolean;
  cng: boolean;
  washroom: boolean;
  airPuncture: boolean;
  servicesRating: number;
  staffRating: number;
  evCharging: boolean;
}

function parseCSV(csvText: string): PumpData[] {
  const lines = csvText.trim().split("\n");
  const pumps: PumpData[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line (handle potential commas in values)
    const values = parseCSVLine(line);
    
    if (values.length >= 9) {
      const [pumpId, name, brand, review, rating, city, state, lat, lon] = values;
      
      pumps.push({
        id: i,
        pumpId: pumpId.trim(),
        name: name.trim(),
        brand: brand.trim(),
        address: `${city.trim()}, ${state.trim()}`,
        review: review.trim(),
        rating: parseFloat(rating) || 4,
        city: city.trim(),
        state: state.trim(),
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        // Default values for legacy fields - these can be reported via DVE
        e20: false,
        e10: false,
        pure: true, // Assume all have petrol
        diesel: true, // Assume all have diesel
        cng: false,
        washroom: false,
        airPuncture: false,
        servicesRating: Math.round(parseFloat(rating) || 4),
        staffRating: Math.round(parseFloat(rating) || 4),
        evCharging: false,
      });
    }
  }

  return pumps;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

export const pumpsData: PumpData[] = parseCSV(petrolPumpsCSV);
