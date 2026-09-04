import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home,
  Inbox,
  Users,
  MapPin,
  Settings,
  Search,
  Plus
} from "lucide-react";

interface NavbarProps {
  onOpenDuplicateCheck: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenDuplicateCheck }) => {
  const location = useLocation();

  const navItems = [
    { to: "/properties", label: "Kho BĐS", icon: Home },
    { to: "/unverified", label: "Tin chờ", icon: Inbox },
    { to: "/customers", label: "Khách hàng", icon: Users },
    { to: "/map", label: "Bản đồ", icon: MapPin },
    { to: "/settings", label: "Cài đặt", icon: Settings },
  ];

  // PARITY-NAV-001: Chỉ hiển thị Bottom Navigation trên các màn hình tab chính trên mobile.
  // Khi vào màn hình chi tiết, biểu mẫu thêm/sửa, hoặc cài đặt con, tự động ẩn thanh điều hướng đáy
  // để tối đa hóa không gian thao tác và chiều cao viewport khả dụng cho người dùng.
  const topLevelRoutes = [
    "/properties",
    "/unverified",
    "/customers",
    "/map",
    "/settings",
    "/statistics"
  ];
  const showMobileBottomNav = topLevelRoutes.includes(location.pathname);

  return (
    <>
      {/* Top Bar Desktop - Luôn hiển thị trên màn hình rộng */}
      <header className="hidden md:flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-lg text-blue-700">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black">
              B
            </div>
            <span>BĐS Collector</span>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenDuplicateCheck}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-300 cursor-pointer"
            title="Kiểm tra trùng BĐS theo tọa độ / bản đồ"
          >
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <span>Kiểm tra trùng</span>
          </button>

          <NavLink
            to="/properties/new"
            className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm BĐS</span>
          </NavLink>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar matching Material 3 NavigationBar - Tự ẩn trên trang con */}
      {showMobileBottomNav && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around z-40 px-2 shadow-lg safe-area-inset-bottom animate-in slide-in-from-bottom duration-150">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className="flex flex-col items-center justify-center flex-1 py-1 group"
              >
                <div
                  className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${
                    isActive
                      ? "bg-blue-100 text-blue-700"
                      : "text-slate-500 group-hover:text-slate-800"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.75]"}`} />
                </div>
                <span
                  className={`text-[11px] mt-0.5 font-medium transition-colors ${
                    isActive ? "text-blue-700 font-semibold" : "text-slate-500"
                  }`}
                >
                  {label}
                </span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </>
  );
};
