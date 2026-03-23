# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }

# Keep our BroadcastReceiver
-keep class com.shooter.android.PermissionActionReceiver { *; }

# Keep WebAppInterface JS bridge methods (called via @JavascriptInterface)
-keepclassmembers class com.shooter.android.WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}

# Google ML Kit / Code Scanner
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode** { *; }
