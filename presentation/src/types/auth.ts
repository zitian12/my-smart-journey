export type User = {
  id: string;
  name: string;
  email: string;
  profile_picture: string;
  nickname: string;
  bio: string;
  phone: string;
  created_at?: string | null;
};

export type ApiUser = {
  id: string;
  email: string;
  full_name: string;
  profile_picture: string;
  nickname?: string;
  bio?: string;
  phone?: string;
  created_at?: string | null;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: ApiUser;
};

export function mapApiUser(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    name: apiUser.full_name,
    email: apiUser.email,
    profile_picture: apiUser.profile_picture,
    nickname: apiUser.nickname ?? "",
    bio: apiUser.bio ?? "",
    phone: apiUser.phone ?? "",
    created_at: apiUser.created_at ?? null,
  };
}
