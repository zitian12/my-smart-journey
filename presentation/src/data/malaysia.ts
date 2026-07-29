export type Destination = {
  id: string;
  name: string;
  description: string;
  image: string;
  lat: number;
  lng: number;
};

export const destinations: Destination[] = [
  {
    id: "kuala-lumpur",
    name: "Kuala Lumpur",
    description:
      "Skyline icons, street food, and green escapes in the heart of Malaysia.",
    image:
      "https://app.accessnewswire.com/imagelibrary/a23710ab-dfaa-48a9-b3a3-69f874f54bde/1090011/asean-summit1.jpg",
    lat: 3.139,
    lng: 101.6869,
  },
  {
    id: "penang",
    name: "Penang",
    description:
      "Heritage streets, murals, and world-famous hawker culture in George Town.",
    image:
      "https://www.toptravelsights.com/wp-content/uploads/2020/05/Penang-Street-Art-6.jpg",
    lat: 5.4141,
    lng: 100.3288,
  },
  {
    id: "langkawi",
    name: "Langkawi",
    description:
      "Island beaches, mangroves, and cable-car views over the Andaman Sea.",
    image:
      "https://thumbs.dreamstime.com/b/eagle-square-dataran-lang-one-langkawi-s-best-known-man-made-attractions-large-sculpture-poised-to-take-langkawi-161917161.jpg",
    lat: 6.35,
    lng: 99.8,
  },
  {
    id: "cameron-highlands",
    name: "Cameron Highlands",
    description:
      "Cool misty hills, tea plantations, and strawberry farms above the clouds.",
    image:
      "https://th.bing.com/th/id/OIP.CfhPNxq-NuKg4q_uNB3xUgHaE8?w=291&h=194&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3",
    lat: 4.4721,
    lng: 101.3802,
  },
  {
    id: "sabah",
    name: "Sabah",
    description:
      "Mount Kinabalu, rainforest wildlife, and islands off Kota Kinabalu.",
    image:
      "https://th.bing.com/th/id/OIP.utY28vvKPGxI5m88AlBAWAHaE6?w=216&h=150&c=6&r=0&o=7&dpr=1.3&pid=1.7&rm=3",
    lat: 5.9804,
    lng: 116.0735,
  },
  {
    id: "melaka",
    name: "Melaka",
    description:
      "Colonial riverside charm, night markets, and living UNESCO heritage.",
    image:
      "https://images.travelandleisureasia.com/wp-content/uploads/sites/4/2025/01/30160027/attractions-in-melaka-2.jpeg",
    lat: 2.1896,
    lng: 102.2501,
  },
];

export const mapCities = [
  { name: "Kuala Lumpur", lat: 3.139, lng: 101.6869 },
  { name: "George Town, Penang", lat: 5.4141, lng: 100.3288 },
  { name: "Langkawi", lat: 6.35, lng: 99.8 },
  { name: "Cameron Highlands", lat: 4.4721, lng: 101.3802 },
  { name: "Kota Kinabalu", lat: 5.9804, lng: 116.0735 },
  { name: "Melaka", lat: 2.1896, lng: 102.2501 },
  { name: "Johor Bahru", lat: 1.4927, lng: 103.7414 },
  { name: "Ipoh", lat: 4.5975, lng: 101.0901 },
] as const;

export const HERO_IMAGE =
  "https://cdn.pixabay.com/photo/2016/11/13/12/52/kuala-lumpur-1820944_1280.jpg";
