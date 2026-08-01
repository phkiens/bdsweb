package com.example.ui.nearby

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable

/**
 * Vẽ + cache các marker bitmap cho MapSurvey. Tách khỏi MapSurveyScreen (god-file B3a).
 * Giữ cache nội bộ — tạo 1 instance qua remember{} trong Composable để cache sống theo vòng đời màn.
 */
internal class MapMarkerFactory {
    private val pinDrawableCache = mutableMapOf<String, BitmapDrawable>()
    private val focusIndicatorCache = mutableMapOf<String, BitmapDrawable>()
    private val clusterDrawableCache = mutableMapOf<String, BitmapDrawable>()

    fun getPin(context: Context, color: Int, text: String? = null): BitmapDrawable {
        val cacheKey = "pin_${color}_${text ?: ""}"
        return pinDrawableCache.getOrPut(cacheKey) {
            val density = context.resources.displayMetrics.density
            val size = (36 * density).toInt()
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            
            val paint = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
                this.color = color
            }
            
            // Pin body
            canvas.drawCircle(size / 2f, size / 3f, size / 3f, paint)
            
            // Pin tail
            val path = Path().apply {
                moveTo(size / 2f - size / 6f, size / 3f + size / 6f)
                lineTo(size / 2f, size.toFloat())
                lineTo(size / 2f + size / 6f, size / 3f + size / 6f)
                close()
            }
            canvas.drawPath(path, paint)
            
            // Inner badge
            paint.color = android.graphics.Color.WHITE
            canvas.drawCircle(size / 2f, size / 3f, size / 6f + (if (text != null) 2 * density else 0f), paint)
            
            if (text != null) {
                paint.apply {
                    this.color = android.graphics.Color.RED
                    textSize = 11 * density
                    textAlign = Paint.Align.CENTER
                    typeface = Typeface.DEFAULT_BOLD
                }
                val textHeight = paint.descent() - paint.ascent()
                val textOffset = textHeight / 2 - paint.descent()
                canvas.drawText(text, size / 2f, size / 3f + textOffset, paint)
            }
            
            BitmapDrawable(context.resources, bitmap)
        }
    }

    fun getFocusIndicator(context: Context): BitmapDrawable {
        return focusIndicatorCache.getOrPut("focus") {
            val density = context.resources.displayMetrics.density
            val width = (36 * density).toInt()
            val height = (54 * density).toInt()
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)

            val paint = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
                color = android.graphics.Color.parseColor("#4CAF50")
            }

            val startY = 4 * density
            val endY = 14 * density
            val centerX = width / 2f

            val path = Path().apply {
                moveTo(centerX - 8 * density, startY)
                lineTo(centerX + 8 * density, startY)
                lineTo(centerX, endY)
                close()
            }
            canvas.drawPath(path, paint)

            val paintCircle = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
                color = android.graphics.Color.parseColor("#8BC34A")
            }
            canvas.drawCircle(centerX, startY, 4 * density, paintCircle)

            BitmapDrawable(context.resources, bitmap)
        }
    }

    fun getCluster(
        context: Context,
        officialCount: Int,
        unverifiedCount: Int,
        hasSelected: Boolean
    ): BitmapDrawable {
        val cacheKey = "cluster_${officialCount}_${unverifiedCount}_${hasSelected}"
        return clusterDrawableCache.getOrPut(cacheKey) {
            val density = context.resources.displayMetrics.density
            val size = (36 * density).toInt()
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            
            val paint = Paint().apply {
                isAntiAlias = true
                style = Paint.Style.FILL
            }
            
            val radius = size / 3.2f
            val cx = size / 2f
            val cy = size / 2f
            
            // 1. Draw Background circle / arcs
            if (officialCount > 0 && unverifiedCount == 0) {
                paint.color = android.graphics.Color.BLUE
                canvas.drawCircle(cx, cy, radius, paint)
            } else if (unverifiedCount > 0 && officialCount == 0) {
                paint.color = android.graphics.Color.parseColor("#FFA500") // Orange
                canvas.drawCircle(cx, cy, radius, paint)
            } else {
                // Mixed: draw two arcs (left and right)
                val rect = android.graphics.RectF(cx - radius, cy - radius, cx + radius, cy + radius)
                
                // Left half - Blue
                paint.color = android.graphics.Color.BLUE
                canvas.drawArc(rect, 90f, 180f, true, paint)
                
                // Right half - Orange
                paint.color = android.graphics.Color.parseColor("#FFA500")
                canvas.drawArc(rect, 270f, 180f, true, paint)
            }
            
            // 2. Draw Red border if it contains selected items
            if (hasSelected) {
                paint.apply {
                    style = Paint.Style.STROKE
                    this.color = android.graphics.Color.RED
                    strokeWidth = 2.5f * density
                }
                canvas.drawCircle(cx, cy, radius, paint)
            }
            
            // 3. Draw inner white badge
            paint.apply {
                style = Paint.Style.FILL
                paint.color = android.graphics.Color.WHITE
            }
            val totalText = (officialCount + unverifiedCount).toString()
            canvas.drawCircle(cx, cy, radius / 2f + 1.5f * density, paint)
            
            // 4. Draw number text
            paint.apply {
                this.color = if (hasSelected) android.graphics.Color.RED else android.graphics.Color.BLACK
                textSize = 10 * density
                textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT_BOLD
            }
            val textHeight = paint.descent() - paint.ascent()
            val textOffset = textHeight / 2 - paint.descent()
            canvas.drawText(totalText, cx, cy + textOffset, paint)
            
            BitmapDrawable(context.resources, bitmap)
        }
    }
}
