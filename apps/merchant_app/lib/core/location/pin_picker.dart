import 'package:flutter/material.dart';
import 'package:maplibre/maplibre.dart';

import '../../app/localization/copy.dart';
import '../config/app_config.dart';
import 'geo_pin.dart';

Future<GeoPin?> pickLocation(BuildContext context, {GeoPin? initial}) =>
    showDialog<GeoPin>(
      context: context,
      useRootNavigator: false,
      builder: (_) => _PinDialog(initial: initial),
    );

class PinField extends StatelessWidget {
  const PinField({
    super.key,
    this.value,
    required this.onChanged,
    this.enabled = true,
  });
  final GeoPin? value;
  final ValueChanged<GeoPin?> onChanged;
  final bool enabled;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (value != null)
        Text(
          '${value!.latitude.toStringAsFixed(6)}, ${value!.longitude.toStringAsFixed(6)}',
          textDirection: TextDirection.ltr,
        ),
      OutlinedButton.icon(
        onPressed: !enabled
            ? null
            : () async {
                final pin = await pickLocation(context, initial: value);
                if (pin != null && context.mounted) onChanged(pin);
              },
        icon: const Icon(Icons.pin_drop_outlined),
        label: Text(context.tr('parcel_choose_pin')),
      ),
      if (value != null)
        TextButton(
          onPressed: enabled ? () => onChanged(null) : null,
          child: Text(context.tr('parcel_remove_pin')),
        ),
    ],
  );
}

class _PinDialog extends StatefulWidget {
  const _PinDialog({this.initial});
  final GeoPin? initial;
  @override
  State<_PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends State<_PinDialog> {
  late final TextEditingController _latitude;
  late final TextEditingController _longitude;
  GeoPin? _candidate;
  bool _invalid = false;
  @override
  void initState() {
    super.initState();
    _candidate = widget.initial;
    _latitude = TextEditingController(
      text: widget.initial?.latitude.toString() ?? '',
    );
    _longitude = TextEditingController(
      text: widget.initial?.longitude.toString() ?? '',
    );
  }

  @override
  void dispose() {
    _latitude.dispose();
    _longitude.dispose();
    super.dispose();
  }

  void _manual() {
    final lat = double.tryParse(_latitude.text.trim());
    final lng = double.tryParse(_longitude.text.trim());
    GeoPin? pin;
    try {
      if (lat != null && lng != null) pin = GeoPin(lat, lng);
    } on FormatException {
      /* Show a localized validation message. */
    }
    setState(() {
      _candidate = pin;
      _invalid = pin == null;
    });
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.tr('parcel_choose_pin')),
    content: SizedBox(
      width: 640,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(context.tr('parcel_pin_help')),
            const SizedBox(height: 12),
            SizedBox(
              height: 280,
              child: MapLibreMap(
                options: MapOptions(
                  initStyle: AppConfig.mapStyleUrl,
                  initZoom: 8,
                  initCenter: Geographic(
                    lon: widget.initial?.longitude ?? 35.2,
                    lat: widget.initial?.latitude ?? 31.9,
                  ),
                ),
                onEvent: (event) {
                  if (event is MapEventClick) {
                    final pin = GeoPin(event.point.lat, event.point.lon);
                    setState(() {
                      _candidate = pin;
                      _invalid = false;
                      _latitude.text = pin.latitude.toStringAsFixed(6);
                      _longitude.text = pin.longitude.toStringAsFixed(6);
                    });
                  }
                },
                children: [
                  const SourceAttribution(),
                  if (_candidate != null)
                    WidgetLayer(
                      markers: [
                        Marker(
                          point: Geographic(
                            lon: _candidate!.longitude,
                            lat: _candidate!.latitude,
                          ),
                          size: const Size(40, 40),
                          alignment: Alignment.bottomCenter,
                          child: Icon(
                            Icons.location_pin,
                            size: 40,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _latitude,
              textDirection: TextDirection.ltr,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
                signed: true,
              ),
              decoration: InputDecoration(
                labelText: context.tr('parcel_latitude'),
              ),
              onChanged: (_) => _manual(),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _longitude,
              textDirection: TextDirection.ltr,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
                signed: true,
              ),
              decoration: InputDecoration(
                labelText: context.tr('parcel_longitude'),
              ),
              onChanged: (_) => _manual(),
            ),
            if (_invalid)
              Text(
                context.tr('parcel_pin_error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(context.tr('back')),
      ),
      FilledButton(
        onPressed: _candidate == null
            ? null
            : () => Navigator.pop(context, _candidate),
        child: Text(context.tr('parcel_confirm_pin')),
      ),
    ],
  );
}
