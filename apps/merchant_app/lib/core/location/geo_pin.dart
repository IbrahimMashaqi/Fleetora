class GeoPin {
  GeoPin(this.latitude, this.longitude) {
    if (!latitude.isFinite ||
        !longitude.isFinite ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180) {
      throw const FormatException('Invalid coordinates');
    }
  }
  final double latitude;
  final double longitude;
}
