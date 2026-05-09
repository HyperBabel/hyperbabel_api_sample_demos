# Keep kotlinx.serialization metadata used by our @Serializable models.
-keep,includedescriptorclasses class com.hyperbabel.demo.**$$serializer { *; }
-keepclassmembers class com.hyperbabel.demo.** { *** Companion; }
-keepclasseswithmembers class com.hyperbabel.demo.** { kotlinx.serialization.KSerializer serializer(...); }
