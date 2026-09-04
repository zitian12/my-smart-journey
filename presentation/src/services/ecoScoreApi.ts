const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type LeaderboardPeriod = "day" | "week" | "month" | "year";

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  profile_picture: string;
  trip_count: number;
  carbon_saved_kg: number;
  average_score: number;
  is_current_user: boolean;
};

export type LeaderboardResponse = {
  period: LeaderboardPeriod;
  period_start: string;
  period_end: string;
  entries: LeaderboardEntry[];
};

export class EcoScoreApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EcoScoreApiError";
    this.status = status;
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const error = await response.json().catch(() => ({ detail: fallback }));
  if (typeof error.detail === "string") return error.detail;
  return fallback;
}

export async function fetchLeaderboard(
  token: string,
  period: LeaderboardPeriod,
): Promise<LeaderboardResponse> {
  const response = await fetch(
    `${API_URL}/api/eco-score/leaderboard?period=${encodeURIComponent(period)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    throw new EcoScoreApiError(
      await readError(response, "Failed to load leaderboard"),
      response.status,
    );
  }
  return response.json();
}
