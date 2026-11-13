/** Designer-approved display catalogue, 13 November 2026. No MCC classification rules. */
export const categoryCatalogue: Record<
  string,
  { label: string; description: string; color: string }
> = {
  transfers: {
    label: "Money transfers",
    description:
      "Outgoing money transfers. The purpose of each transfer may be unknown.",
    color: "#7FA8D9",
  },
  groceries: {
    label: "Groceries",
    description:
      "Supermarkets and food and drink shops, including bakeries and alcohol retailers.",
    color: "#86B89A",
  },
  financial: {
    label: "Financial services",
    description:
      "Payments to financial institutions. The payment purpose may vary.",
    color: "#B3A0D6",
  },
  dining: {
    label: "Restaurants & cafés",
    description: "Restaurants, cafés, fast food, catering and drinking venues.",
    color: "#D9AF70",
  },
  health: {
    label: "Healthcare",
    description:
      "Medical services and supplies, including dental and vision care.",
    color: "#69BFC0",
  },
  pharmacies: {
    label: "Pharmacies",
    description: "Purchases from pharmacies and drugstores.",
    color: "#D69AAF",
  },
  pets: {
    label: "Pets & veterinary",
    description: "Pet shops and veterinary services.",
    color: "#B8BD78",
  },
  shopping: {
    label: "General shopping",
    description:
      "Marketplaces, general retailers, florists, and gift and specialty shops.",
    color: "#C39778",
  },
  taxis: {
    label: "Taxis & rides",
    description: "Taxi and similar passenger transport services.",
    color: "#D8C579",
  },
  digital: {
    label: "Digital purchases",
    description: "Purchases from sellers offering a mix of digital products.",
    color: "#9DADE0",
  },
  services: {
    label: "Professional & business services",
    description:
      "Professional, business and legal services, including film and video production and distribution.",
    color: "#A6B7C7",
  },
  cash: {
    label: "Cash withdrawals",
    description:
      "Cash withdrawn from your account. How it is later spent is not tracked here.",
    color: "#8CABC1",
  },
  telecom: {
    label: "Connectivity & online services",
    description:
      "Phone, internet access and other network services, including hosting.",
    color: "#7FBACB",
  },
  software: {
    label: "Software & apps",
    description:
      "Software and apps from specialist sellers, excluding video games.",
    color: "#A59BD0",
  },
  public_transport: {
    label: "Public transport",
    description: "Local public transport, buses and passenger trains.",
    color: "#A0B985",
  },
  games: {
    label: "Video games",
    description:
      "Digital video games and related purchases from gaming sellers.",
    color: "#BA91C8",
  },
  travel: {
    label: "Travel services",
    description: "Travel agencies, tours and vehicle rentals.",
    color: "#87B3BE",
  },
  delivery: {
    label: "Post & delivery",
    description: "Postal and courier services.",
    color: "#C5B38B",
  },
  cosmetics: {
    label: "Cosmetics & perfume",
    description: "Purchases from cosmetics and perfume shops.",
    color: "#C69CBA",
  },
  charity: {
    label: "Charity",
    description:
      "Payments to charitable organizations. Personal transfers may appear under Money transfers.",
    color: "#A3C0AC",
  },
  beauty: {
    label: "Beauty & personal care",
    description: "Hairdressers, beauty salons and personal care services.",
    color: "#D2A5A3",
  },
  clothing: {
    label: "Clothing & accessories",
    description: "Clothing, footwear, accessories, watches and jewelry.",
    color: "#AD9DBF",
  },
  electronics: {
    label: "Electronics & appliances",
    description: "Electronics, home appliances, phones and computer equipment.",
    color: "#88A6BF",
  },
  hobbies: {
    label: "Hobbies & toys",
    description: "Toys and hobby supplies from specialist shops.",
    color: "#C3AD79",
  },
  media: {
    label: "Media & streaming",
    description:
      "Digital media, streaming, paid TV, recorded music and video rentals.",
    color: "#9C9DCB",
  },
  entertainment: {
    label: "Entertainment & events",
    description: "Cinemas, events, attractions and other leisure activities.",
    color: "#C696B7",
  },
  accommodation: {
    label: "Accommodation",
    description: "Hotels and other lodging.",
    color: "#91B6A9",
  },
  fitness: {
    label: "Sports & fitness",
    description: "Sports shops, fitness clubs and sporting activities.",
    color: "#A9BE83",
  },
  utilities: {
    label: "Utilities",
    description: "Electricity, gas, water and other utility services.",
    color: "#86B3B2",
  },
  education: {
    label: "Education",
    description: "Schools, courses and other educational services.",
    color: "#B9B088",
  },
  home_repairs: {
    label: "Home & repairs",
    description:
      "Furniture, home goods, building materials and home repair services.",
    color: "#B8A28C",
  },
  taxes: {
    label: "Taxes & government",
    description: "Taxes and payments for government services.",
    color: "#9FA9BC",
  },
  fuel: {
    label: "Fuel & charging",
    description: "Fuel stations and electric vehicle charging.",
    color: "#C4B37A",
  },
  vehicle: {
    label: "Vehicle maintenance",
    description: "Vehicle servicing, repairs and parts.",
    color: "#ABA18F",
  },
  parking: {
    label: "Parking & tolls",
    description: "Parking and road or bridge tolls.",
    color: "#A2B9BD",
  },
  flights: {
    label: "Flights",
    description: "Payments to airlines for air travel.",
    color: "#8CB7D2",
  },
  books: {
    label: "Books & stationery",
    description: "Bookshops and stationery stores.",
    color: "#B6AE98",
  },
  insurance: {
    label: "Insurance",
    description: "Insurance policies and premiums.",
    color: "#9AA9C9",
  },
  other: {
    label: "Uncategorized",
    description: "We couldn’t assign this payment to a spending category.",
    color: "#B5AAA0",
  },
};
