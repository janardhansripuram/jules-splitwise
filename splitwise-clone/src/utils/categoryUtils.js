export const CATEGORY_KEYWORDS = {
  'Food & Dining': ['food', 'restaurant', 'cafe', 'grocery', 'dinner', 'lunch', 'breakfast', 'meal', 'takeout', 'delivery', 'coffee', 'tea', 'snack', 'bar', 'pub', 'brunch', 'canteen', 'bakery', 'pizza', 'burger', 'sushi', 'pasta', 'salad'],
  'Groceries': ['supermarket', 'grocery store', 'groceries', 'provisions', 'market'], // Made more specific to avoid overlap with Food & Dining if "grocery" is in restaurant bill
  'Transportation': ['taxi', 'uber', 'lyft', 'bus', 'train', 'metro', 'gas', 'fuel', 'petrol', 'parking', 'flight', 'scooter', 'bike share', 'toll', 'ride', 'subway', 'tram', 'rv', 'airfare', 'boat'],
  'Utilities': ['electricity', 'water', 'internet', 'phone', 'mobile', 'bill', 'utility', 'gas bill', 'heating', 'trash', 'sewage', 'isp', 'cable', 'hydro'],
  'Housing': ['rent', 'mortgage', 'lease', 'strata', 'property tax', 'hoa', 'lodging', 'landlord', 'repairs', 'maintenance fee'],
  'Entertainment': ['movie', 'cinema', 'concert', 'game', 'show', 'bar', 'club', 'party', 'event', 'ticket', 'streaming', 'music', 'book', 'hobby', 'theater', 'festival', 'arcade', 'nightclub', 'spotify', 'netflix', 'hulu', 'disney+', 'concerts', 'shows'],
  'Shopping': ['clothes', 'electronics', 'gift', 'store', 'online shopping', 'apparel', 'shoes', 'accessories', 'furniture', 'decor', 'mall', 'market', 'boutique', 'purchase', 'amazon', 'ebay', 'retail'],
  'Health & Wellness': ['doctor', 'pharmacy', 'gym', 'medication', 'wellness', 'hospital', 'dentist', 'therapy', 'fitness', 'optician', 'clinic', 'massage', 'vitamins'],
  'Travel': ['hotel', 'airbnb', 'flight', 'vacation', 'trip', 'hostel', 'resort', 'cruise', 'booking', 'tourism', 'excursion', 'passport', 'visa', 'luggage'],
  'Education': ['school', 'college', 'university', 'course', 'books', 'tuition', 'student loan', 'workshop', 'seminar', 'udemy', 'coursera'],
  'Personal Care': ['haircut', 'salon', 'beauty', 'cosmetics', 'spa', 'barber', 'manicure', 'pedicure', 'skincare', 'makeup'],
  'Gifts & Donations': ['gift', 'present', 'donation', 'charity', 'fundraising', 'offering', 'tithe', 'contribution'],
  'Kids': ['toys', 'baby', 'childcare', 'diapers', 'school supplies', 'children', 'kids clothes'],
  'Pets': ['pet food', 'vet', 'veterinarian', 'pet supplies', 'grooming', 'pet toys', 'animal hospital'],
  'Business': ['office supplies', 'software', 'business lunch', 'conference', 'professional fees', 'work expense', 'client meeting'],
  'Finance': ['bank fee', 'atm fee', 'investment', 'stocks', 'transfer fee', 'loan payment', 'insurance', 'life insurance', 'car insurance', 'health insurance', 'home insurance'],
  'Home Improvement': ['hardware', 'diy', 'renovation', 'gardening', 'home depot', 'lowes', 'ikea'],
  'Miscellaneous': ['misc', 'random', 'various', 'sundry'], // For less common, general terms
  'Other': [] // Default category, ensure this is last or handled as a fallback
};

export const CATEGORY_COLORS = {
  'Food & Dining': '#FF6384',    // Coral Pink
  'Groceries': '#FF9F40',        // Orange Peel
  'Transportation': '#4BC0C0',   // Teal
  'Utilities': '#FFCE56',       // Sunglow Yellow
  'Housing': '#9966FF',         // Amethyst Purple
  'Entertainment': '#36A2EB',   // Process Blue
  'Shopping': '#F39C12',        // Orange
  'Health & Wellness': '#2ECC71',// Emerald Green
  'Travel': '#E74C3C',          // Alizarin Crimson Red
  'Education': '#3498DB',       // Peter River Blue
  'Personal Care': '#1ABC9C',   // Turquoise
  'Gifts & Donations': '#795548',// Brown
  'Kids': '#F1C40F',            // Sunflower Yellow
  'Pets': '#27AE60',            // Nephritis Green
  'Business': '#607D8B',        // Blue Grey
  'Finance': '#546E7A',         // Darker Blue Grey
  'Home Improvement': '#8D6E63', // Light Brown
  'Miscellaneous': '#BDC3C7',   // Silver
  'Other': '#95A5A6'            // Concrete Grey
};

/**
 * Determines the category of an expense based on its description.
 * Iterates through predefined keywords for each category.
 * The first category to have a keyword match in the description is returned.
 * Order of categories in CATEGORY_KEYWORDS can matter if keywords overlap.
 *
 * @param {string} description - The expense description.
 * @returns {string} The determined category, or 'Other' if no match.
 */
export function getCategoryFromDescription(description) {
  if (!description || typeof description !== 'string') {
    return 'Other';
  }
  const lowerDesc = description.toLowerCase();

  // Iterate in the order defined in CATEGORY_KEYWORDS
  for (const category in CATEGORY_KEYWORDS) {
    // No need for hasOwnProperty check if CATEGORY_KEYWORDS is a plain object literal
    // and not extended via prototype chain, which is typical for such constants.
    const keywords = CATEGORY_KEYWORDS[category];
    for (const keyword of keywords) {
      // Using a simple includes check. For more accuracy, could use regex with word boundaries (\b).
      // Example: /\bkeyword\b/i.test(lowerDesc)
      if (lowerDesc.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  return 'Other'; // Default if no keywords match
}
