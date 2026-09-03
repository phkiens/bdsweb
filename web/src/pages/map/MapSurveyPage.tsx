import React, { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Navigation,
  Calendar,
  ChevronRight,
  Route,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import { db } from "../../data/local/db";
import { Property } from "../../core/models/property";
import { RouteOptimizer } from "../../core/engine/route-optimizer";
import { PropertyStatus } from "../../core/models/enums";

// Fix standard leaflet icon path issues in Vite
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export const MapSurveyPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const polylineLayerRef = useRef<L.Polyline | null>(null);

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [routeInfo, setRouteInfo] = useState<string | null>(null);
  const [viewTodayOnly, setViewTodayOnly] = useState(false);

  const properties = useLiveQuery(async () => {
    return await db.properties
      .where("isDeleted")
      .equals(0 as any)
      .toArray();
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = searchParams.get("lat") ? parseFloat(searchParams.get("lat")!) : 10.7769;
    const initialLng = searchParams.get("lng") ? parseFloat(searchParams.get("lng")!) : 106.7009;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 14,
      zoomControl: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [searchParams]);

  // Update markers when properties or filter changes
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current || !properties) return;

    markersLayerRef.current.clearLayers();

    const validProps = properties.filter((p) => {
      if (p.latitude === null || p.longitude === null) return false;
      if (viewTodayOnly && !p.needToViewToday) return false;
      return true;
    });

    validProps.forEach((p) => {
      const marker = L.marker([p.latitude!, p.longitude!]);
      marker.on("click", () => {
        setSelectedProperty(p);
      });
      markersLayerRef.current?.addLayer(marker);
    });
  }, [properties, viewTodayOnly]);

  const handleCenterGps = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      mapRef.current?.setView([latitude, longitude], 16);
      L.circleMarker([latitude, longitude], {
        radius: 8,
        fillColor: "#2563eb",
        color: "#ffffff",
        weight: 3,
        fillOpacity: 1
      }).addTo(mapRef.current!);
    });
  };

  const handleOptimizeRoute = () => {
    if (!properties || !mapRef.current) return;

    const points = properties
      .filter((p) => p.latitude !== null && p.longitude !== null && (viewTodayOnly ? p.needToViewToday : true))
      .map((p) => ({
        id: p.id,
        latitude: p.latitude!,
        longitude: p.longitude!,
        title: p.area,
        property: p
      }));

    if (points.length < 2) {
      alert("Cần ít nhất 2 bất động sản có tọa độ để lập lộ trình tối ưu.");
      return;
    }

    setIsOptimizing(true);
    const result = RouteOptimizer.optimize(null, points);

    // Draw polyline
    if (polylineLayerRef.current) {
      polylineLayerRef.current.remove();
    }

    const latlngs: [number, number][] = result.optimizedPoints.map((pt) => [pt.latitude, pt.longitude]);
    const polyline = L.polyline(latlngs, {
      color: "#2563eb",
      weight: 4,
      opacity: 0.8,
      dashArray: "8, 8"
    }).addTo(mapRef.current);

    polylineLayerRef.current = polyline;
    mapRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40] });

    setRouteInfo(`Lộ trình tối ưu qua ${result.optimizedPoints.length} BĐS đã được tạo.`);
    setIsOptimizing(false);
  };

  return (
    <div className="relative w-full h-[calc(100vh-64px)] overflow-hidden">
      {/* Leaflet Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Map Controls */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        <button
          onClick={() => setViewTodayOnly(!viewTodayOnly)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-all ${
            viewTodayOnly ? "bg-blue-600 text-white" : "bg-white text-slate-800 hover:bg-slate-50"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>{viewTodayOnly ? "Đang lọc: Hôm nay" : "Chỉ xem hôm nay"}</span>
        </button>

        <button
          onClick={handleOptimizeRoute}
          disabled={isOptimizing}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold shadow-md transition-all border border-slate-200/80"
        >
          <Route className="w-4 h-4 text-blue-600" />
          <span>{isOptimizing ? "Đang tính..." : "Tối ưu lộ trình khảo sát"}</span>
        </button>
      </div>

      {/* Center GPS Button */}
      <button
        onClick={handleCenterGps}
        className="absolute bottom-24 md:bottom-8 right-4 z-20 w-11 h-11 bg-white hover:bg-slate-50 text-slate-700 rounded-full shadow-lg border border-slate-200 flex items-center justify-center transition-transform active:scale-95"
        title="Vị trí của tôi"
      >
        <Navigation className="w-5 h-5 text-blue-600" />
      </button>

      {/* Route Info Toast */}
      {routeInfo && (
        <div className="absolute top-4 right-16 z-20 bg-blue-900/90 text-white text-xs px-3 py-1.5 rounded-lg shadow-md backdrop-blur-xs flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{routeInfo}</span>
        </div>
      )}

      {/* Bottom Item Preview Sheet */}
      {selectedProperty && (
        <div className="absolute bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-30 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  selectedProperty.status === PropertyStatus.FOR_SALE
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {selectedProperty.status}
              </span>
              <h4 className="font-bold text-slate-900 text-sm md:text-base mt-1 line-clamp-1">
                {selectedProperty.area}
              </h4>
            </div>

            <button
              onClick={() => setSelectedProperty(null)}
              className="text-slate-400 hover:text-slate-600 text-sm p-1"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600 mt-2">
            <span className="text-blue-700 font-extrabold text-sm">
              {selectedProperty.price > 0 ? `${selectedProperty.price} tỷ` : "Thương lượng"}
            </span>
            {selectedProperty.areaSize && <span>• {selectedProperty.areaSize} m²</span>}
            {selectedProperty.propertyType && <span>• {selectedProperty.propertyType}</span>}
          </div>

          <div className="flex gap-2 mt-3 pt-2 border-t border-slate-100">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedProperty.latitude},${selectedProperty.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
              <span>Chỉ đường</span>
            </a>

            <button
              onClick={() => navigate(`/properties/${selectedProperty.id}`)}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <span>Xem chi tiết</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
