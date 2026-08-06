export type TrendingPlace = {
  id: string;
  name: string;
  description: string;
  state: string;
  image: string;
};

export type DestinationCategory = {
  id: string;
  title: string;
  description: string;
  places: TrendingPlace[];
};

export const destinationCategories: DestinationCategory[] = [
  {
    id: "beach-island",
    title: "Beach & Island",
    description: "Sun-soaked shores and crystal waters across both coasts.",
    places: [
      {
        id: "langkawi",
        name: "Langkawi",
        description:
          "Duty-free island paradise with beaches, mangroves, and the iconic Sky Bridge.",
        state: "Kedah",
        image:
          "https://images.unsplash.com/photo-1588666309993-0d18854e09d2?w=800&q=80",
      },
      {
        id: "perhentian",
        name: "Perhentian Islands",
        description:
          "Turquoise bays and coral reefs perfect for snorkeling and laid-back island life.",
        state: "Terengganu",
        image:
          "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&q=80",
      },
      {
        id: "redang",
        name: "Redang Island",
        description:
          "Pristine marine park with white sand beaches and vibrant underwater gardens.",
        state: "Terengganu",
        image:
          "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
      },
      {
        id: "sipadan",
        name: "Sipadan Island",
        description:
          "World-renowned dive site surrounded by rich marine biodiversity.",
        state: "Sabah",
        image:
          "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80",
      },
    ],
  },
  {
    id: "city-culture",
    title: "City & Culture",
    description: "Urban skylines, museums, and the pulse of modern Malaysia.",
    places: [
      {
        id: "kuala-lumpur",
        name: "Kuala Lumpur",
        description:
          "Iconic towers, bustling markets, and a melting pot of cultures in the capital.",
        state: "Kuala Lumpur",
        image:
          "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80",
      },
      {
        id: "george-town",
        name: "George Town",
        description:
          "UNESCO-listed streets lined with shophouses, temples, and street art.",
        state: "Penang",
        image:
          "https://images.unsplash.com/photo-1583417319070-4a1bc7584cba?w=800&q=80",
      },
      {
        id: "putrajaya",
        name: "Putrajaya",
        description:
          "Striking mosques, lakeside parks, and grand government architecture.",
        state: "Putrajaya",
        image:
          "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80",
      },
      {
        id: "ipoh",
        name: "Ipoh",
        description:
          "Limestone hills, heritage cafés, and a thriving arts scene in Perak's capital.",
        state: "Perak",
        image:
          "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
      },
    ],
  },
  {
    id: "nature-highland",
    title: "Nature & Highland",
    description: "Misty peaks, ancient rainforests, and cool hill retreats.",
    places: [
      {
        id: "cameron-highlands",
        name: "Cameron Highlands",
        description:
          "Rolling tea plantations, strawberry farms, and cool mountain air.",
        state: "Pahang",
        image:
          "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
      },
      {
        id: "kinabalu",
        name: "Kinabalu Park",
        description:
          "Home to Southeast Asia's highest peak and diverse montane ecosystems.",
        state: "Sabah",
        image:
          "https://images.unsplash.com/photo-1464822759023-fed622ff2c3f?w=800&q=80",
      },
      {
        id: "taman-negara",
        name: "Taman Negara",
        description:
          "One of the world's oldest rainforests with canopy walks and river trails.",
        state: "Pahang",
        image:
          "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80",
      },
      {
        id: "frasers-hill",
        name: "Fraser's Hill",
        description:
          "Colonial-era hill station with birdwatching and forested walking paths.",
        state: "Pahang",
        image:
          "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80",
      },
    ],
  },
  {
    id: "food-heritage",
    title: "Food & Heritage",
    description: "Historic towns and flavors that define Malaysian identity.",
    places: [
      {
        id: "melaka",
        name: "Melaka",
        description:
          "Riverside heritage, night markets, and centuries of multicultural history.",
        state: "Melaka",
        image:
          "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=800&q=80",
      },
      {
        id: "penang-food",
        name: "Penang Hawker Trails",
        description:
          "Char kway teow, assam laksa, and hawker stalls that draw food lovers worldwide.",
        state: "Penang",
        image:
          "https://images.unsplash.com/photo-1583417319070-4a1bc7584cba?w=800&q=80",
      },
      {
        id: "kuching",
        name: "Kuching Waterfront",
        description:
          "Sarawak's charming capital with riverfront walks and indigenous culture.",
        state: "Sarawak",
        image:
          "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
      },
      {
        id: "kota-bharu",
        name: "Kota Bharu",
        description:
          "Kelantan's cultural heart with crafts, markets, and traditional Malay cuisine.",
        state: "Kelantan",
        image:
          "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=800&q=80",
      },
    ],
  },
];
