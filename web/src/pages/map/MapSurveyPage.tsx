import React, { useEffect, useRef, useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Navigation,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Route,
  CheckCircle2,
  ExternalLink,
  Target,
  Phone,
  X
} from "lucide-react";
import { db } from "../../data/local/db";
import { RouteOptimizer } from "../../core/engine/route-optimizer";
import { PropertyStatus } from "../../core/models/enums";
import {
  filterMapProperties,
  getMarkerColorType,
  MapScanCenter,
  MapPropertyItem
} from "../../core/engine/map-survey-engine";
import { isInVietnam } from "../../core/utils/coordinates";
import { createMapPinIcon, createGpsUserIcon } from "./map-marker-icons";
import { PropertyThumbnail } from "../../components/properties/PropertyThumbnail";

export const MapSurveyPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const gpsLayerRef = useRef<L.LayerGroup | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const polylineLayerRef = useRef<L.Polyline | null>(null);

  const hasInitialFitRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [routeInfo, setRouteInfo] = useState<string | null>(null);
  const [viewTodayOnly, setViewTodayOnly] = useState(false);

  // GPS & Radius survey state (MAP-SURVEY-GPS-001)
  const [userScanCenter, setUserScanCenter] = useState<MapScanCenter | null>(null);
  const [userRadiusKm, setUserRadiusKm] = useState<number | null>(null);
  const [userGps, setUserGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState(false);

  const properties = useLiveQuery(async () => {
    return await db.properties
      .filter((p) => !p.isDeleted)
      .toArray();
  }, []);

  // Derive scan center from user selection or query param
  const scanCenter = useMemo(() => {
    if (userScanCenter) return userScanCenter;
    const centerPropId = searchParams.get("centerPropertyId");
    if (centerPropId && properties) {
      const centerProp = properties.find((p) => p.id === centerPropId);
      if (centerProp && centerProp.latitude != null && centerProp.longitude != null) {
        return {
          type: "PROPERTY" as const,
          latitude: centerProp.latitude,
          longitude: centerProp.longitude,
          propertyId: centerProp.id,
          label: centerProp.area
        };
      }
    }
    return null;
  }, [userScanCenter, searchParams, properties]);

  const radiusKm = userRadiusKm !== null ? userRadiusKm : scanCenter ? 2.0 : null;

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

    const googleRoads = L.tileLayer("https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution: "&copy; Google Maps"
    });

    const googleHybrid = L.tileLayer("https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      maxZoom: 20,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      attribution: "&copy; Google Maps"
    });

    const osmHot = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a>'
    });

    googleRoads.addTo(map);

    L.control.layers(
      {
        "Bản đồ Google": googleRoads,
        "Vệ tinh Google": googleHybrid,
        "Bản đồ Mở (OSM)": osmHot
      },
      undefined,
      { position: "topright" }
    ).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    gpsLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const invalidateTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(invalidateTimer);
      map.remove();
      mapRef.current = null;
    };
  }, [searchParams]);

  // Filtered properties based on GPS/Center and Radius
  const filteredProperties = useMemo(() => {
    if (!properties) return [];
    return filterMapProperties(properties, scanCenter, radiusKm, viewTodayOnly);
  }, [properties, scanCenter, radiusKm, viewTodayOnly]);

  // Derived selected index and property
  const selectedIndex = useMemo(() => {
    if (!selectedPropertyId) return -1;
    return filteredProperties.findIndex((p) => p.id === selectedPropertyId);
  }, [filteredProperties, selectedPropertyId]);

  const selectedProperty = selectedIndex !== -1 ? filteredProperties[selectedIndex] : null;

  const handleSelectIndex = (newIndex: number) => {
    if (newIndex >= 0 && newIndex < filteredProperties.length) {
      const target = filteredProperties[newIndex];
      setSelectedPropertyId(target.id);
      if (target.latitude != null && target.longitude != null && mapRef.current) {
        mapRef.current.panTo([target.latitude, target.longitude], { animate: true });
      }
    }
  };

  // Keyboard navigation for preview carousel
  useEffect(() => {
    if (selectedIndex === -1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && selectedIndex > 0) {
        handleSelectIndex(selectedIndex - 1);
      } else if (e.key === "ArrowRight" && selectedIndex < filteredProperties.length - 1) {
        handleSelectIndex(selectedIndex + 1);
      } else if (e.key === "Escape") {
        setSelectedPropertyId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, filteredProperties]);

  // Touch gesture handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (Math.abs(deltaX) > 40) {
      if (deltaX > 0 && selectedIndex > 0) {
        handleSelectIndex(selectedIndex - 1);
      } else if (deltaX < 0 && selectedIndex < filteredProperties.length - 1) {
        handleSelectIndex(selectedIndex + 1);
      }
    }
  };

  // Update markers on map
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    filteredProperties.forEach((p) => {
      const isSelected = selectedPropertyId === p.id;
      const colorType = getMarkerColorType(p);
      const icon = createMapPinIcon(colorType, isSelected);

      const marker = L.marker([p.latitude!, p.longitude!], { icon });
      marker.on("click", () => {
        setSelectedPropertyId(p.id);
        if (p.latitude != null && p.longitude != null && mapRef.current) {
          mapRef.current.panTo([p.latitude, p.longitude], { animate: true });
        }
      });
      markersLayerRef.current?.addLayer(marker);
    });

    // Auto-fit bounds on initial load if no explicit center is specified
    if (!hasInitialFitRef.current && !searchParams.get("lat") && !userScanCenter) {
      const validPoints = filteredProperties
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => [p.latitude!, p.longitude!] as [number, number]);

      if (validPoints.length > 0) {
        const bounds = L.latLngBounds(validPoints);
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        hasInitialFitRef.current = true;
      }
    }
  }, [filteredProperties, selectedPropertyId, searchParams, userScanCenter]);

  // Draw or update radius circle around scanCenter
  useEffect(() => {
    if (!mapRef.current) return;

    if (radiusCircleRef.current) {
      radiusCircleRef.current.remove();
      radiusCircleRef.current = null;
    }

    if (scanCenter != null && radiusKm != null) {
      const circle = L.circle([scanCenter.latitude, scanCenter.longitude], {
        radius: radiusKm * 1000,
        color: "#3b82f6",
        fillColor: "#93c5fd",
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: "6, 6"
      }).addTo(mapRef.current);

      radiusCircleRef.current = circle;
    }
  }, [scanCenter, radiusKm]);

  // Update user GPS location pin on map
  useEffect(() => {
    if (!mapRef.current || !gpsLayerRef.current) return;

    gpsLayerRef.current.clearLayers();

    if (userGps) {
      const userMarker = L.marker([userGps.latitude, userGps.longitude], {
        icon: createGpsUserIcon(),
        zIndexOffset: 1000
      });
      gpsLayerRef.current.addLayer(userMarker);
    }
  }, [userGps]);

  const handleCenterGps = () => {
    if (!navigator.geolocation || !mapRef.current) {
      alert("Thiết bị hoặc trình duyệt không hỗ trợ Geolocation.");
      return;
    }

    setIsLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        const { latitude, longitude } = pos.coords;
        setUserGps({ latitude, longitude });

        setUserScanCenter({
          type: "GPS",
          latitude,
          longitude,
          label: "Vị trí GPS của bạn"
        });

        setUserRadiusKm(2.0);

        mapRef.current?.setView([latitude, longitude], 15);
      },
      (err) => {
        setIsLocatingGps(false);
        alert("Không thể lấy vị trí GPS: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSelectPropertyAsCenter = (p: MapPropertyItem) => {
    if (p.latitude == null || p.longitude == null) return;
    setUserScanCenter({
      type: "PROPERTY",
      latitude: p.latitude,
      longitude: p.longitude,
      propertyId: p.id,
      label: p.area
    });
    setUserRadiusKm(2.0);
    mapRef.current?.setView([p.latitude, p.longitude], 15);
  };

  const handleClearScanCenter = () => {
    setUserScanCenter(null);
    setUserRadiusKm(null);
    if (mapRef.current && properties) {
      const validPoints = properties
        .filter((p) => p.latitude != null && p.longitude != null && isInVietnam(p.latitude, p.longitude))
        .map((p) => [p.latitude!, p.longitude!] as [number, number]);
      if (validPoints.length > 0) {
        mapRef.current.fitBounds(L.latLngBounds(validPoints), { padding: [50, 50], maxZoom: 16 });
      }
    }
  };

  const handleOptimizeRoute = () => {
    if (!filteredProperties || !mapRef.current) return;

    const points = filteredProperties
      .filter((p) => p.latitude !== null && p.longitude !== null)
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
    const startPoint: [number, number] | null = userGps
      ? [userGps.latitude, userGps.longitude]
      : null;

    const result = RouteOptimizer.optimize(startPoint, points);

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
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-[calc(100vw-32px)] sm:max-w-md">
        {/* Row 1: Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setViewTodayOnly(!viewTodayOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer ${
              viewTodayOnly ? "bg-blue-600 text-white" : "bg-white text-slate-800 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{viewTodayOnly ? "Đang lọc: Hôm nay" : "Chỉ xem hôm nay"}</span>
          </button>

          <button
            onClick={handleOptimizeRoute}
            disabled={isOptimizing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold shadow-md transition-all border border-slate-200 cursor-pointer"
          >
            <Route className="w-3.5 h-3.5 text-blue-600" />
            <span>{isOptimizing ? "Đang tính..." : "Tối ưu lộ trình"}</span>
          </button>
        </div>

        {/* Row 2: Radius Filter Bar (MAP-SURVEY-GPS-001) */}
        <div className="p-2.5 bg-white/95 backdrop-blur-xs rounded-2xl shadow-lg border border-slate-200 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700">
            <span className="flex items-center gap-1 text-slate-500">
              <Target className="w-3.5 h-3.5 text-blue-600" />
              {scanCenter ? scanCenter.label || "Tâm quét" : "Toàn bộ bản đồ"}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md font-bold text-[10px]">
                {filteredProperties.length} BĐS
              </span>
              {scanCenter && (
                <button
                  onClick={handleClearScanCenter}
                  className="text-slate-400 hover:text-red-600 p-0.5"
                  title="Hủy tâm quét"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {[
              { val: null, label: "Tất cả" },
              { val: 0.5, label: "500m" },
              { val: 1.0, label: "1 km" },
              { val: 2.0, label: "2 km" },
              { val: 5.0, label: "5 km" }
            ].map((b) => {
              const isSelected = radiusKm === b.val;
              return (
                <button
                  key={String(b.val)}
                  onClick={() => {
                    setUserRadiusKm(b.val);
                    if (b.val !== null && scanCenter === null && userGps !== null) {
                      setUserScanCenter({
                        type: "GPS",
                        latitude: userGps.latitude,
                        longitude: userGps.longitude,
                        label: "Vị trí GPS của bạn"
                      });
                    }
                  }}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
                    isSelected
                      ? "bg-blue-600 text-white font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          {/* Color Legend (Parity with MapMarkerFactory.kt) */}
          <div className="flex items-center gap-3 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <span>BĐS chính thức</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Tin chờ khảo sát</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center GPS Button */}
      <button
        onClick={handleCenterGps}
        disabled={isLocatingGps}
        className={`absolute bottom-24 md:bottom-8 right-4 z-20 w-12 h-12 rounded-full shadow-xl border flex items-center justify-center transition-all cursor-pointer ${
          scanCenter?.type === "GPS"
            ? "bg-blue-600 text-white border-blue-700 shadow-blue-200"
            : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
        } ${isLocatingGps ? "animate-pulse" : "active:scale-95"}`}
        title="Quét BĐS quanh vị trí GPS của tôi"
      >
        <Navigation className={`w-5 h-5 ${scanCenter?.type === "GPS" ? "text-white fill-white" : "text-blue-600"}`} />
      </button>

      {/* Route Info Toast */}
      {routeInfo && (
        <div className="absolute top-4 right-16 z-20 bg-blue-900/90 text-white text-xs px-3 py-1.5 rounded-lg shadow-md backdrop-blur-xs flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{routeInfo}</span>
        </div>
      )}

      {/* Bottom Item Preview Sheet (PARITY-MAP-001: Horizontal Pager / Carousel for Nearby Properties) */}
      {selectedProperty && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="absolute bottom-20 md:bottom-6 left-3 right-3 md:left-auto md:right-6 md:w-[420px] z-30 bg-white rounded-2xl shadow-xl border border-slate-200 p-3.5 sm:p-4 animate-in slide-in-from-bottom duration-200 transition-all select-none"
        >
          {/* Header Bar: Carousel Index Pager & Close Button */}
          <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              {filteredProperties.length > 1 ? (
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => handleSelectIndex(selectedIndex - 1)}
                    disabled={selectedIndex <= 0}
                    className="p-1 rounded-md text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white cursor-pointer transition-colors"
                    title="BĐS trước"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-[11px] font-bold text-blue-700 px-2 select-none">
                    {selectedIndex + 1} / {filteredProperties.length}
                  </span>

                  <button
                    onClick={() => handleSelectIndex(selectedIndex + 1)}
                    disabled={selectedIndex >= filteredProperties.length - 1}
                    className="p-1 rounded-md text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white cursor-pointer transition-colors"
                    title="BĐS tiếp theo"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-[11px] font-semibold text-slate-500">
                  Chi tiết BĐS
                </span>
              )}
            </div>

            <button
              onClick={() => setSelectedPropertyId(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body: Thumbnail + Info */}
          <div className="flex items-start gap-3">
            <PropertyThumbnail
              property={selectedProperty}
              size={64}
              showStarBadge={true}
              className="rounded-xl shrink-0"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    selectedProperty.isVerified
                      ? selectedProperty.status === PropertyStatus.FOR_SALE
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {selectedProperty.isVerified ? selectedProperty.status : "Tin chờ"}
                </span>

                {selectedProperty.distanceKm != null && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                    Cách {selectedProperty.distanceKm < 1 ? `${Math.round(selectedProperty.distanceKm * 1000)} m` : `${selectedProperty.distanceKm.toFixed(1)} km`}
                  </span>
                )}
              </div>

              <h4 className="font-bold text-slate-900 text-sm mt-1 truncate">
                {selectedProperty.area}
              </h4>

              <div className="flex items-center gap-2 text-xs text-slate-600 mt-1 flex-wrap">
                <span className="text-blue-700 font-extrabold text-sm">
                  {selectedProperty.price > 0 ? `${selectedProperty.price} tỷ` : "Thương lượng"}
                </span>
                {selectedProperty.areaSize && <span>• {selectedProperty.areaSize} m²</span>}
                {selectedProperty.propertyType && <span>• {selectedProperty.propertyType}</span>}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex gap-2 mt-3 pt-2.5 border-t border-slate-100">
            <button
              onClick={() => handleSelectPropertyAsCenter(selectedProperty)}
              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="Đặt làm tâm quét bán kính"
            >
              <Target className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tâm quét</span>
            </button>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selectedProperty.latitude},${selectedProperty.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors text-center"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
              <span>Chỉ đường</span>
            </a>

            {selectedProperty.ownerPhone && (
              <a
                href={`tel:${selectedProperty.ownerPhone}`}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-colors"
                title={`Gọi: ${selectedProperty.ownerPhone}`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Gọi</span>
              </a>
            )}

            <button
              onClick={() =>
                navigate(
                  selectedProperty.isVerified
                    ? `/properties/${selectedProperty.id}`
                    : `/unverified/${selectedProperty.id}`
                )
              }
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer text-center"
            >
              <span>Chi tiết</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

