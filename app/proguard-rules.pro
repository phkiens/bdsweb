# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# WorkManager creates InputMerger instances through reflection using class
# names persisted in its database. Preserve the built-in no-arg constructors.
-keep,allowoptimization class androidx.work.OverwritingInputMerger {
    public <init>();
}

-keep,allowoptimization class androidx.work.ArrayCreatingInputMerger {
    public <init>();
}

# Strip Android Logcat invocations in optimized release & r8Test builds
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
    public static *** wtf(...);
}

# Strip Throwable.printStackTrace() invocations in optimized release & r8Test builds
-assumenosideeffects class java.lang.Throwable {
    public void printStackTrace();
}
