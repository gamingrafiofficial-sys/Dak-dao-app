export interface GeocodingResult {
  address: string;
  district: string;
  thana: string;
  latitude: number;
  longitude: number;
}

export const reverseGeocode = async (lat: number, lng: number): Promise<GeocodingResult> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    
    if (!response.ok) {
      throw new Error('Geocoding failed');
    }

    const data = await response.json();
    const address = data.display_name;
    
    // Nominatim address parts vary by region. For Bangladesh:
    // city/town/village often maps to thana-like areas
    // state_district or city often maps to district
    const addr = data.address;
    const district = addr.state_district || addr.city || addr.district || 'Dhaka';
    const thana = addr.suburb || addr.neighbourhood || addr.city_district || addr.town || addr.village || 'Dhanmondi';

    return {
      address,
      district,
      thana,
      latitude: lat,
      longitude: lng
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    // Fallback to mock if API fails
    return {
      address: 'Dhanmondi, Dhaka',
      district: 'Dhaka',
      thana: 'Dhanmondi',
      latitude: lat,
      longitude: lng
    };
  }
};
