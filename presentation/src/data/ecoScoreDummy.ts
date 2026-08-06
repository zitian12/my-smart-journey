export type EcoDimension = {
  id: string;
  label: string;
  score: number;
};

export type CarbonByTransportMonth = {
  month: string;
  flight: number;
  car: number;
  train: number;
  bike: number;
};

export type EcoRecommendation = {
  id: string;
  icon: "train" | "stay" | "waste";
  text: string;
};

export const ECO_PROFILE_SCORES: EcoDimension[] = [
  { id: "carbon", label: "Carbon", score: 77 },
  { id: "local-stay", label: "Local Stay", score: 92 },
  { id: "transport", label: "Transport", score: 72 },
  { id: "waste", label: "Waste", score: 81 },
  { id: "community", label: "Community", score: 85 },
  { id: "wildlife", label: "Wildlife", score: 88 },
];

export const CARBON_BY_TRANSPORT: CarbonByTransportMonth[] = [
  { month: "Jan", flight: 52, car: 38, train: 28, bike: 18 },
  { month: "Feb", flight: 48, car: 35, train: 32, bike: 22 },
  { month: "Mar", flight: 55, car: 40, train: 30, bike: 20 },
  { month: "Apr", flight: 42, car: 32, train: 35, bike: 28 },
  { month: "May", flight: 38, car: 28, train: 38, bike: 35 },
  { month: "Jun", flight: 35, car: 25, train: 40, bike: 42 },
];

export const ECO_RECOMMENDATIONS: EcoRecommendation[] = [
  {
    id: "train-penang",
    icon: "train",
    text: "Take KTM ETS from KL Sentral to Penang — saves up to 68 kg CO₂ vs flying",
  },
  {
    id: "eco-stay",
    icon: "stay",
    text: "Stay at eco-certified chalets in Perhentian or Tioman instead of resorts",
  },
  {
    id: "reusable-bottle",
    icon: "waste",
    text: "Pack a reusable bottle and cut single-use plastic by up to 12 kg CO₂ per trip",
  },
];

export const TRANSPORT_LEGEND = [
  { id: "flight", label: "Flight", color: "#ef4444" },
  { id: "car", label: "Car", color: "#f97316" },
  { id: "train", label: "Train", color: "#0d9488" },
  { id: "bike", label: "Bike", color: "#2d6a4f" },
] as const;
