import 'package:geolocator/geolocator.dart';

class LocationResult {
  final double lat;
  final double lng;
  LocationResult(this.lat, this.lng);
}

class LocationException implements Exception {
  final String message;
  LocationException(this.message);
  @override
  String toString() => message;
}

class LocationService {
  /// বর্তমান অবস্থান নেয়, প্রয়োজনে অনুমতি চায়। ব্যর্থ হলে বাংলা বার্তাসহ
  /// LocationException ছোঁড়ে যাতে UI সরাসরি দেখাতে পারে।
  static Future<LocationResult> getCurrentLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw LocationException('লোকেশন সার্ভিস বন্ধ আছে। ফোনের সেটিংস থেকে লোকেশন চালু করুন।');
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw LocationException('অবস্থানের অনুমতি দেওয়া হয়নি।');
      }
    }
    if (permission == LocationPermission.deniedForever) {
      throw LocationException('অবস্থানের অনুমতি স্থায়ীভাবে বন্ধ আছে। অ্যাপ সেটিংস থেকে অনুমতি দিন।');
    }

    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
    return LocationResult(pos.latitude, pos.longitude);
  }
}
