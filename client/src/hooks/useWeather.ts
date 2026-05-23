import { useState, useEffect, useCallback } from 'react';
import { Sun, Cloud, CloudRain, Snowflake, CloudLightning } from 'lucide-react';

export interface WeatherData {
  temp: number;
  windspeed: number;
  code: number;
  placeName: string;
  lat: number;
  lon: number;
}

export function weatherInfo(code: number) {
  if (code === 0)                        return { label: 'Clear Sky',        Icon: Sun };
  if (code <= 3)                         return { label: 'Partly Cloudy',    Icon: Cloud };
  if (code <= 48)                        return { label: 'Foggy',            Icon: Cloud };
  if (code <= 57)                        return { label: 'Drizzle',          Icon: CloudRain };
  if (code <= 67)                        return { label: 'Rain',             Icon: CloudRain };
  if (code <= 77)                        return { label: 'Snow',             Icon: Snowflake };
  if (code <= 82)                        return { label: 'Rain Showers',     Icon: CloudRain };
  if (code <= 86)                        return { label: 'Snow Showers',     Icon: Snowflake };
  return                                        { label: 'Thunderstorm',     Icon: CloudLightning };
}

export function useWeather(defaultDistrict?: string) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [wError, setWError] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchWeatherByCoords = useCallback(async (lat: number, lon: number, placeName: string) => {
    try {
      setLoading(true);
      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`
      );
      if (!wRes.ok) throw new Error('Weather API error');
      const wJson = await wRes.json();
      const cw = wJson.current_weather;
      if (!cw) throw new Error('No current weather data found');
      
      setWeather({
        temp: Math.round(cw.temperature),
        windspeed: Math.round(cw.windspeed),
        code: cw.weathercode,
        placeName,
        lat,
        lon
      });
      setWError(false);
    } catch (err) {
      console.error('Failed to fetch weather for coordinates:', err);
      setWError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeatherByDistrict = useCallback(async (districtName: string) => {
    try {
      setLoading(true);
      const query = `${districtName}, Uganda`;
      const gRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'HydroSense/2.0' } }
      );
      if (!gRes.ok) throw new Error('Geocoding API error');
      const gJson = await gRes.json();
      
      if (gJson && gJson.length > 0) {
        const lat = parseFloat(gJson[0].lat);
        const lon = parseFloat(gJson[0].lon);
        await fetchWeatherByCoords(lat, lon, districtName);
      } else {
        // Fallback to Kampala coordinates if geocoding fails
        await fetchWeatherByCoords(0.3476, 32.5825, districtName || 'Kampala');
      }
    } catch (err) {
      console.error('Failed to geocode district:', err);
      // Fallback to Kampala coordinates on error
      await fetchWeatherByCoords(0.3476, 32.5825, districtName || 'Kampala');
    }
  }, [fetchWeatherByCoords]);

  useEffect(() => {
    let active = true;

    const startFetching = async () => {
      if (!navigator.geolocation) {
        if (defaultDistrict) {
          await fetchWeatherByDistrict(defaultDistrict);
        } else {
          if (active) {
            setWError(true);
            setLoading(false);
          }
        }
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async pos => {
          if (!active) return;
          try {
            const { latitude: lat, longitude: lon } = pos.coords;
            const gRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
              { headers: { 'User-Agent': 'HydroSense/2.0' } }
            );
            const gJson = await gRes.json();
            const place = gJson.address?.city || gJson.address?.town || gJson.address?.county || gJson.address?.state || defaultDistrict || 'Your Location';
            if (active) {
              await fetchWeatherByCoords(lat, lon, place);
            }
          } catch {
            if (active) {
              if (defaultDistrict) {
                await fetchWeatherByDistrict(defaultDistrict);
              } else {
                setWError(true);
                setLoading(false);
              }
            }
          }
        },
        async () => {
          if (active) {
            if (defaultDistrict) {
              await fetchWeatherByDistrict(defaultDistrict);
            } else {
              setWError(true);
              setLoading(false);
            }
          }
        },
        { timeout: 8000 }
      );
    };

    startFetching();

    return () => {
      active = false;
    };
  }, [defaultDistrict, fetchWeatherByDistrict, fetchWeatherByCoords]);

  return { weather, wError, loading, fetchWeatherByDistrict };
}
