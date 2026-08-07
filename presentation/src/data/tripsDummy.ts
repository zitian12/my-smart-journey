export type TripStatus = "upcoming" | "completed";

export type DummyTrip = {
  id: string;
  name: string;
  startPoint: string;
  endPoint: string;
  location: string;
  date: string;
  days: number;
  nights: number;
  travelers: number;
  hoursPerDay: number;
  ecoScore: number;
  status: TripStatus;
  image: string;
  isFavourite: boolean;
};

export const DUMMY_TRIPS: DummyTrip[] = [
  {
    id: "seremban-journey",
    name: "Seremban Journey",
    startPoint: "Kuala Lumpur",
    endPoint: "Johor Bahru",
    location: "Seremban, Malaysia",
    date: "31 Jul 2026",
    days: 3,
    nights: 2,
    travelers: 2,
    hoursPerDay: 7,
    ecoScore: 98,
    status: "upcoming",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80",
    isFavourite: true,
  },
  {
    id: "northern-malaysia-explorer",
    name: "Northern Malaysia Explorer",
    startPoint: "Kuala Lumpur",
    endPoint: "Langkawi",
    location: "Penang · Langkawi · Ipoh, Malaysia",
    date: "15 Aug 2025",
    days: 8,
    nights: 7,
    travelers: 2,
    hoursPerDay: 6,
    ecoScore: 83,
    status: "upcoming",
    image:
      "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=600&q=80",
    isFavourite: true,
  },
  {
    id: "east-coast-heritage",
    name: "East Coast Heritage Trail",
    startPoint: "Kuala Lumpur",
    endPoint: "Kota Bharu",
    location: "Kuantan · Terengganu · Kelantan, Malaysia",
    date: "12 Sep 2025",
    days: 5,
    nights: 4,
    travelers: 3,
    hoursPerDay: 5,
    ecoScore: 76,
    status: "upcoming",
    image:
      "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&q=80",
    isFavourite: false,
  },
  {
    id: "sabah-nature-retreat",
    name: "Sabah Nature Retreat",
    startPoint: "Kota Kinabalu",
    endPoint: "Sandakan",
    location: "Kinabalu · Semporna · Sandakan, Malaysia",
    date: "3 Mar 2025",
    days: 6,
    nights: 5,
    travelers: 2,
    hoursPerDay: 8,
    ecoScore: 91,
    status: "completed",
    image:
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&q=80",
    isFavourite: true,
  },
  {
    id: "melaka-weekend",
    name: "Melaka Weekend Escape",
    startPoint: "Kuala Lumpur",
    endPoint: "Melaka",
    location: "Melaka City, Malaysia",
    date: "18 Jan 2025",
    days: 2,
    nights: 1,
    travelers: 4,
    hoursPerDay: 6,
    ecoScore: 88,
    status: "completed",
    image:
      "https://images.unsplash.com/photo-1588666309993-0d18854e09d2?w=600&q=80",
    isFavourite: false,
  },
  {
    id: "cameron-highlands",
    name: "Cameron Highlands Cool Down",
    startPoint: "Kuala Lumpur",
    endPoint: "Ipoh",
    location: "Cameron Highlands, Malaysia",
    date: "22 Nov 2025",
    days: 4,
    nights: 3,
    travelers: 2,
    hoursPerDay: 5,
    ecoScore: 94,
    status: "upcoming",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&q=80",
    isFavourite: false,
  },
];
