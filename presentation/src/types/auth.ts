export type User = {
  name: string;
  email: string;
  profile_picture: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    profile_picture: string;
  };
};
