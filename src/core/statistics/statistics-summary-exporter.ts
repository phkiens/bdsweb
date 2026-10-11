import { PriceUtils } from "./price-utils";
import { StatisticsUiState } from "./statistics-model";

const ZONE_ID = "Asia/Ho_Chi_Minh";

function formatExportDateTime(epochMs: number): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE_ID,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  let day = "";
  let month = "";
  let year = "";
  let hour = "";
  let minute = "";
  for (const p of parts) {
    if (p.type === "day") day = p.value;
    if (p.type === "month") month = p.value;
    if (p.type === "year") year = p.value;
    if (p.type === "hour") hour = p.value;
    if (p.type === "minute") minute = p.value;
  }
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function formatNumber(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || Number.isNaN(value)) {
    return "Không đủ dữ liệu";
  }
  return PriceUtils.formatOneDecimal(value);
}

function formatPercent(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || Number.isNaN(value)) {
    return "Không đủ dữ liệu";
  }
  return `${PriceUtils.formatOneDecimal(value)}%`;
}

export const StatisticsSummaryExporter = {
  export(
    state: StatisticsUiState,
    exportTimeMillis: number = state.snapshotTimeMillis,
    isLivestream: boolean = false,
    protectOwnerIdentity: boolean = isLivestream
  ): string {
    const shouldProtect = isLivestream || protectOwnerIdentity;
    if (exportTimeMillis <= 0) {
      throw new Error(
        `Thời điểm snapshot không hợp lệ: ${exportTimeMillis}. Không thể xuất báo cáo khi chưa có snapshot hợp lệ.`
      );
    }
    const timeStr = formatExportDateTime(exportTimeMillis);
    const lines: string[] = [];

    lines.push("=== BÁO CÁO THỐNG KÊ THỊ TRƯỜNG BĐS ===");
    lines.push(`Thời điểm xuất: ${timeStr}`);
    lines.push("");

    // -------------------------------------------------------------
    // PHẦN 1: TỔNG QUAN THỊ TRƯỜNG (Tab 0)
    // -------------------------------------------------------------
    lines.push("--- PHẦN 1: TỔNG QUAN THỊ TRƯỜNG ---");
    const inv = state.inventoryData;
    if (inv != null) {
      lines.push(`• Tổng nguồn hàng: ${inv.totalInventory} căn`);
      lines.push(`  - BĐS chính thức: ${inv.verifiedCount} căn`);
      if (state.unverifiedPendingCount > 0) {
        lines.push(`  - Chờ xác minh: ${state.unverifiedPendingCount} căn`);
      }
      lines.push("• Phân bổ trạng thái:");
      lines.push(`  - Đang bán: ${inv.activeCount} căn`);
      lines.push(`  - Đã bán: ${inv.soldCount} căn`);
      lines.push(`  - Khảo sát/Khác: ${inv.pendingSurveyCount + inv.unknownStatusCount} căn`);
      lines.push("• Tuổi tồn kho hàng:");
      lines.push(
        `  - Mới về (≤ 30 ngày): ${inv.agingBuckets.days0to7 + inv.agingBuckets.days8to30} căn`
      );
      lines.push(
        `  - Cần chú ý (31 - 90 ngày): ${inv.agingBuckets.days31to60 + inv.agingBuckets.days61to90} căn`
      );
      lines.push(`  - Tồn đọng (> 90 ngày): ${inv.agingBuckets.daysOver90} căn`);
    } else {
      lines.push("Không đủ dữ liệu");
    }

    const overallMedian = state.priceTableResult?.overallMedianPricePerM2;
    if (overallMedian != null && overallMedian > 0) {
      lines.push(
        `• Giá trung vị kho đang bán: ${formatNumber(overallMedian * 1000.0)} tr/m²`
      );
    }

    const radar = state.radarOpportunityResult;
    if (radar && radar.type === "SUCCESS") {
      const topOpp = radar.topOpportunities.length > 0 ? radar.topOpportunities[0] : null;
      if (topOpp != null) {
        const scoreStr = formatNumber(topOpp.opportunityScore);
        const devStr =
          topOpp.priceDeviationPercent != null
            ? (topOpp.priceDeviationPercent > 0 ? "+" : "") + formatPercent(topOpp.priceDeviationPercent)
            : "Không đủ dữ liệu";
        const liqStr =
          topOpp.soldRatioProxy != null
            ? formatPercent(topOpp.soldRatioProxy * 100.0)
            : "Không đủ dữ liệu";
        lines.push(
          `• Cơ hội nổi bật: ${topOpp.areaDisplayName} - ${topOpp.propertyTypeDisplayName} | Điểm: ${scoreStr} đ | Lệch giá: ${devStr} | Thanh khoản [Ước tính]: ${liqStr}`
        );
      }
    }
    const actionCount = state.actionItems ? state.actionItems.length : 0;
    lines.push(`• Vấn đề cần xử lý: ${actionCount} mục cần xử lý`);
    lines.push("");

    // -------------------------------------------------------------
    // PHẦN 2: PHÂN KHÚC & NGUỒN HÀNG (Tab 1)
    // -------------------------------------------------------------
    lines.push("--- PHẦN 2: PHÂN KHÚC & NGUỒN HÀNG ---");
    if (radar) {
      switch (radar.type) {
        case "SUCCESS": {
          if (radar.topOpportunities.length === 0) {
            lines.push("Chưa ghi nhận phân khúc cơ hội đạt chuẩn.");
          } else {
            lines.push("• Top phân khúc ưu tiên:");
            radar.topOpportunities.slice(0, 3).forEach((opp, idx) => {
              const scoreStr = formatNumber(opp.opportunityScore);
              const devStr =
                opp.priceDeviationPercent != null
                  ? (opp.priceDeviationPercent > 0 ? "+" : "") + formatPercent(opp.priceDeviationPercent)
                  : "Không đủ dữ liệu";
              const liqStr =
                opp.soldRatioProxy != null
                  ? formatPercent(opp.soldRatioProxy * 100.0)
                  : "Không đủ dữ liệu";
              lines.push(
                `  #${idx + 1}: ${opp.areaDisplayName} - ${opp.propertyTypeDisplayName} | Điểm: ${scoreStr} đ | Lệch giá: ${devStr} | Thanh khoản [Ước tính]: ${liqStr}`
              );
            });
          }
          break;
        }
        case "EMPTY_INVENTORY":
          lines.push("Chưa có BĐS đang bán trong bộ lọc để phân tích phân khúc.");
          break;
        case "INSUFFICIENT_BENCHMARK":
          lines.push(
            "Chưa đủ điều kiện đối chiếu (cần ít nhất 2 khu vực có từ 5 mẫu giá)."
          );
          break;
        case "INVALID_FILTER":
          lines.push(`Bộ lọc không hợp lệ: ${radar.reason}`);
          break;
      }
    } else {
      lines.push("Không đủ dữ liệu");
    }

    const perf = state.performanceResult;
    if (perf != null) {
      const overallRate =
        perf.summary.displayOverallSoldRatioPercent != null
          ? formatPercent(perf.summary.displayOverallSoldRatioPercent)
          : "Không đủ dữ liệu";
      lines.push(
        `• Tỷ lệ bán toàn thị trường [Ước tính]: ${overallRate} (${perf.summary.totalSoldCreatedInWindow}/${perf.summary.totalLiquidityDenominator} căn trong kỳ)`
      );
      if (perf.byArea.length > 0) {
        lines.push("• Top khu vực thanh khoản cao:");
        const sortedAreas = perf.byArea
          .filter((it) => it.displaySoldRatioPercent != null)
          .sort((a, b) => (b.displaySoldRatioPercent ?? 0) - (a.displaySoldRatioPercent ?? 0))
          .slice(0, 3);
        sortedAreas.forEach((areaRow) => {
          const rateStr =
            areaRow.displaySoldRatioPercent != null
              ? formatPercent(areaRow.displaySoldRatioPercent)
              : "Không đủ dữ liệu";
          lines.push(
            `  - ${areaRow.displayName}: ${rateStr} (${areaRow.soldCreatedInWindow}/${areaRow.liquidityDenominator} căn) [Ước tính]`
          );
        });
      }
    }

    const ownerPerf = state.ownerPerformanceResult;
    if (ownerPerf != null && ownerPerf.items.length > 0) {
      lines.push("• Nguồn hàng theo chủ nhà:");
      ownerPerf.items.slice(0, 3).forEach((owner, idx) => {
        const rateStr =
          owner.displaySoldRatioPercent != null
            ? formatPercent(owner.displaySoldRatioPercent)
            : "Không đủ dữ liệu";
        const ownerDisplayName = shouldProtect ? `Chủ nhà #${idx + 1}` : owner.ownerName;
        lines.push(
          `  #${idx + 1}: ${ownerDisplayName} | Tổng BĐS: ${owner.totalPropertiesListed} | Đã bán: ${owner.soldPropertiesCount} | Tỷ lệ bán [Ước tính]: ${rateStr}`
        );
      });
    }
    lines.push("");

    // -------------------------------------------------------------
    // PHẦN 3: BẢN ĐỒ GIÁ & PHÂN BỔ KHÔNG GIAN (Tab 2)
    // -------------------------------------------------------------
    lines.push("--- PHẦN 3: BẢN ĐỒ GIÁ & PHÂN BỔ KHÔNG GIAN ---");
    const mapRes = state.priceMapResult;
    if (mapRes != null) {
      lines.push(`• Số điểm BĐS định vị (Dots): ${mapRes.dotPoints.length} điểm`);
      lines.push(`• Số cụm khu vực (Clusters): ${mapRes.areaClusters.length} cụm`);
      if (mapRes.areaClusters.length > 0) {
        lines.push("• Điểm nóng mật độ kho:");
        const sortedClusters = [...mapRes.areaClusters]
          .sort((a, b) => b.inventoryCount - a.inventoryCount)
          .slice(0, 3);
        sortedClusters.forEach((c) => {
          const medianPrice =
            c.medianPricePerM2 != null ? `${formatNumber(c.medianPricePerM2)} tr/m²` : "Không đủ dữ liệu";
          lines.push(`  - ${c.areaDisplayName}: ${c.inventoryCount} căn | Giá trung vị: ${medianPrice}`);
        });
      }
    } else {
      lines.push("Không đủ dữ liệu");
    }
    lines.push("");

    // -------------------------------------------------------------
    // CẦN XỬ LÝ & CHẤT LƯỢNG DỮ LIỆU
    // -------------------------------------------------------------
    lines.push("--- CẦN XỬ LÝ & CHẤT LƯỢNG DỮ LIỆU ---");
    const dq = state.dataQualitySummary;
    if (dq != null) {
      const crit = dq.issuesBySeverity["CRITICAL"] ?? 0;
      const warn = dq.issuesBySeverity["WARNING"] ?? 0;
      const info = dq.issuesBySeverity["INFO"] ?? 0;

      lines.push(`• Tổng số lỗi phát hiện: ${dq.totalIssues}`);
      lines.push(`  - Lỗi nghiêm trọng (Critical): ${crit}`);
      lines.push(`  - Cảnh báo (Warning): ${warn}`);
      lines.push(`  - Nhắc nhở (Info): ${info}`);
    } else {
      lines.push("Không đủ dữ liệu");
    }

    if (state.actionItems && state.actionItems.length > 0) {
      lines.push("• Việc cần xử lý ưu tiên:");
      state.actionItems.slice(0, 5).forEach((act, idx) => {
        lines.push(`  #${idx + 1}: [${act.priority.name}] ${act.title} (${act.count} căn)`);
      });
    } else if (dq != null) {
      lines.push("• Hiện không có việc cần xử lý tồn đọng.");
    }
    lines.push("===============================");

    return lines.join("\n") + "\n";
  }
};
