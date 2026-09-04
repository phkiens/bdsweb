import L from "leaflet";
import { MarkerColorType } from "../../core/engine/map-survey-engine";

export function createMapPinIcon(
  colorType: MarkerColorType,
  isSelected: boolean = false
): L.DivIcon {
  const isBlue = colorType === "blue";
  const isOrange = colorType === "orange";

  const pinColor = isBlue ? "#2563eb" : isOrange ? "#ea580c" : "#10b981";
  const ringColor = isSelected ? "#ef4444" : "rgba(0, 0, 0, 0.2)";
  const ringWidth = isSelected ? 3 : 1;
  const size = isSelected ? 36 : 30;

  const innerContent = isBlue
    ? "<path d=\"M16 11L11 15H13V19H19V15H21L16 11Z\" fill=\"" + pinColor + "\"/>"
    : "<circle cx=\"16\" cy=\"15\" r=\"3.5\" fill=\"" + pinColor + "\"/>";

  const html =
    "<div style=\"position: relative; width: " +
    size +
    "px; height: " +
    size +
    "px; display: flex; align-items: center; justify-content: center; cursor: pointer;\">" +
    "<svg width=\"" +
    size +
    "\" height=\"" +
    size +
    "\" viewBox=\"0 0 32 40\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" style=\"filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));\">" +
    "<path d=\"M16 0C7.163 0 0 7.163 0 16C0 26.5 14.5 38.8 15.1 39.3C15.6 39.7 16.4 39.7 16.9 39.3C17.5 38.8 32 26.5 32 16C32 7.163 24.837 0 16 0Z\" fill=\"" +
    pinColor +
    "\" stroke=\"" +
    ringColor +
    "\" stroke-width=\"" +
    ringWidth +
    "\"/>" +
    "<circle cx=\"16\" cy=\"15\" r=\"7\" fill=\"white\"/>" +
    innerContent +
    "</svg></div>";

  return L.divIcon({
    html,
    className: "bds-custom-map-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size]
  });
}

export function createGpsUserIcon(): L.DivIcon {
  const html =
    "<div style=\"position: relative; width: 24px; height: 24px;\">" +
    "<div style=\"position: absolute; width: 24px; height: 24px; border-radius: 50%; background-color: rgba(37, 99, 235, 0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;\"></div>" +
    "<div style=\"position: absolute; top: 4px; left: 4px; width: 16px; height: 16px; border-radius: 50%; background-color: #2563eb; border: 3px solid #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3);\"></div>" +
    "</div>";

  return L.divIcon({
    html,
    className: "bds-gps-user-marker",
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

