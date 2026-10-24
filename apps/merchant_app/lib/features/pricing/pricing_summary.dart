import 'package:flutter/material.dart';

import '../../app/localization/copy.dart';
import '../../core/formatting/value_format.dart';
import '../../core/networking/models.dart';

/// All amounts come from the server; this widget never derives financial values.
class PricingSummary extends StatelessWidget {
  const PricingSummary({super.key, required this.preview});
  final PricingPreview preview;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            context.tr('parcel_price_preview'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          _row(context, 'parcel_final_amount', preview.finalCustomerAmount),
          _row(context, 'parcel_base_fee', preview.baseDeliveryFee),
          _row(context, 'parcel_discount', preview.discount),
          _row(context, 'parcel_promotion', preview.promotionDiscount),
          if (preview.promotionLabel != null) Text(preview.promotionLabel!),
          _row(context, 'parcel_delivery_fee', preview.deliveryFee),
          _row(context, 'parcel_proceeds', preview.expectedMerchantProceeds),
          const SizedBox(height: 8),
          Text(
            context.tr('parcel_proceeds_note'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    ),
  );
  Widget _row(BuildContext context, String key, String amount) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Wrap(
      alignment: WrapAlignment.spaceBetween,
      spacing: 16,
      children: [
        Text(context.tr(key)),
        Text(
          exactMoney(
            amount,
            preview.currency,
            Localizations.localeOf(context).toLanguageTag(),
          ),
          textDirection: TextDirection.ltr,
        ),
      ],
    ),
  );
}
