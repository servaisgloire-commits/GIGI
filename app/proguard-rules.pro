# FAST N°1 keeps WebView bridge methods available to JavaScript.
-keepclassmembers class cg.fast.n1.MainActivity$FastNativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}


# JavascriptInterface is inspected at runtime by WebView.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
