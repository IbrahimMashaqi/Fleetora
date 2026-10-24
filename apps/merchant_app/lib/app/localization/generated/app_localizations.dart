import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
  ];

  /// Localized operational copy and server status labels.
  ///
  /// In en, this message translates to:
  /// **'{key, select, appName{Fleetora Merchant} home{Overview} parcels{Parcels} pickups{Pickup requests} account{Account} login{Sign in} email{Email} password{Password} name{Full name} activate{Activate account} activationToken{Invitation code} activationHelp{Use the secure invitation supplied by your delivery company.} activated{Account activated. Sign in with your email and password.} loginHelp{Manage your deliveries with your company.} logout{Sign out} language{العربية} loading{Loading…} retry{Try again} back{Back} confirm{Confirm} save{Save} saved{Saved successfully} empty{No records yet} previous{Previous} next{Next} search{Search} required{This field is required} invalidEmail{Enter a valid email address} invalidPassword{Use at least 8 characters} newParcel{Create parcel} imports{Bulk import} newPickup{Request pickup} finances{Statement} settlements{Settlement requests} employees{Employees} activity{Activity history} profile{Account} permissionDenied{You do not have permission to view this page.} welcome{Your merchant workspace} dashboardHelp{Create parcels, arrange pickups and follow deliveries.} recentParcels{Recent parcels} viewAll{View all} view{View} sessionExpired{Your session expired. Sign in again.} logoutWarning{Sign out of this device?} configuration{API_BASE_URL must point to your Fleetora backend. Use HTTPS for release builds.} unavailable{Not available} error_network{Cannot connect. Check your connection and try again. For an uncertain write, check the list before submitting again.} error_unauthorized{Your session expired. Sign in again.} error_forbidden{You do not have permission for this action.} error_notFound{This record is no longer available.} error_conflict{The record or price changed. Refresh before continuing.} error_validation{Check the entered values and invitation validity.} error_server{The service is temporarily unavailable. Please try later.} error_invalidResponse{Could not read the server response. Refresh or contact your company.} error_sessionChanged{The signed-in account changed. Reload this page.} status_CREATED{Created — awaiting receipt} status_READY_FOR_PICKUP{Ready for pickup} status_PICKUP_ASSIGNED{Pickup assigned} status_PICKED_UP{Picked up} status_AT_WAREHOUSE{At warehouse} status_ASSIGNED{Assigned} status_OUT_FOR_DELIVERY{Out for delivery} status_DELIVERED{Delivered} status_DELIVERY_FAILED{Delivery failed} status_RETURN_REQUESTED{Return requested} status_RETURN_IN_TRANSIT{Return in transit} status_RETURNED{Returned} status_CANCELLED{Cancelled} status_REQUESTED{Requested} status_PROPOSED{Proposed time} status_CONFIRMED{Confirmed} status_RECEIVED{Received} status_REVIEWED{Reviewed} status_APPROVED{Approved} status_REJECTED{Rejected} status_ACTIVE{Active} status_REVOKED{Revoked} status_PENDING{Awaiting receipt} status_MISSING{Missing} status_DISCREPANT{Received with discrepancy} status_MERCHANT{With merchant} status_DRIVER{Driver custody} status_WAREHOUSE{Warehouse custody} status_CUSTOMER{With recipient} status_COMPANY_PICKUP{Company pickup} status_WAREHOUSE_DROPOFF{Warehouse drop-off} status_COD{Cash on delivery} status_PREPAID{Prepaid / no collection} accounting{Financial statement} financeAccessRequired{Financial access is required to view this page.} balances{Balances} balance{Balance} eligibleBalance{Eligible for settlement} paidBalance{Paid} statementEntries{Statement entries} relatedParcel{Related parcel} refreshStatement{Refresh statement} ledger_GOODS{Goods collected} ledger_DELIVERY_FEE{Delivery fee} ledger_RETURN_FEE{Return fee} ledger_ADJUSTMENT{Adjustment} ledger_REVERSAL{Reversal} ledger_entry{Financial entry} import_title{Import parcels from Excel} import_instructions{Use the approved XLSX template. Maximum 200 rows and 1.5 MB. Keep amounts and phone numbers as text. Pricing and validation are checked by the company.} import_template{Download Excel template} import_select{Select XLSX file} import_wrongType{Choose an XLSX workbook.} import_tooLarge{The file exceeds the 1.5 MB limit.} import_emptyFile{The selected file is empty.} import_denied{You do not have permission to import parcels.} import_confirm{Confirm import} import_confirmMessage{Import the valid rows only?} import_review{Review before importing} import_valid{Valid} import_invalid{Invalid} import_validOnly{Only valid rows will be imported. Invalid rows will be rejected. Review prices before confirming.} import_uncertain{Confirmation has not been verified. Retry the same import to recover its result without creating duplicate parcels.} import_retrySame{Retry this confirmation} import_result{Import result} import_created{Created} import_rejected{Rejected} import_duplicates{Duplicates} import_labels{Open parcel labels} import_parcelLinks{Open a parcel to see its tracking number and details.} import_parcel{Parcel} import_another{Import another workbook} import_row{Row} import_customerPayable{Customer payment (delivery included)} import_fee{Delivery fee} import_proceeds{Expected merchant proceeds} import_plainText{Use plain text; formulas, links and numeric cells are not accepted here.} import_collectionMismatch{Collection mode does not match the customer payment.} import_pricingUnavailable{Zone or commercial pricing is unavailable for this row.} import_invalidValue{Missing or invalid value. Correct this row using the template instructions.} import_field_recipientName{Recipient name} import_field_recipientPhone{Recipient phone} import_field_secondaryPhone{Secondary phone} import_field_city{City} import_field_destination{Address} import_field_zoneId{Delivery zone} import_field_finalCustomerAmount{Final customer payment} import_field_collectionMode{Collection mode} import_field_description{Description} import_field_pieces{Pieces} import_field_merchantReference{Merchant reference} import_field_notes{Notes} merchantUsers{Employees and invitations} ownerAccessRequired{Owner access is required.} merchantActivity{Merchant activity} merchantActivityHelp{Latest 200 access and pickup events. Parcel changes also appear in each parcel timeline.} activityActor{Performed by} refreshActivity{Refresh activity} invitations{Invitations} inviteEmployee{Invite an employee} employeeEmail{Employee email} validEmployeeEmail{Enter a valid email address.} explicitPermissionHelp{Select each permission. Financial access is separate and is never granted automatically.} createEmployeeInvitation{Create invitation} secureInvitationHandoff{Deliver the invitation securely} invitationTokenHelp{This token appears only now. Deliver it directly to the invited employee through a trusted channel. No email was sent. Dismiss it after delivery.} dismissInvitationToken{Dismiss token} editEmployeeAccess{Edit employee access} employeeAccountActive{Account active} saveEmployeeAccess{Save access} employeeAccessConfirmation{Apply these permissions and account status to this employee?} invitationExpires{Expires} revokeInvitation{Revoke invitation} revokeInvitationConfirmation{Revoke this invitation? The employee will no longer be able to activate an account using it.} refreshTeam{Refresh employees and invitations} role_OWNER{Owner} role_EMPLOYEE{Employee} status_SUSPENDED{Suspended} invitation_pending{Pending} invitation_accepted{Accepted} invitation_revoked{Revoked} invitation_expired{Expired} permission_PARCEL_VIEW{View parcels} permission_PARCEL_CREATE{Create parcels} permission_PARCEL_EDIT{Edit eligible parcels} permission_PARCEL_CANCEL{Cancel eligible parcels} permission_PARCEL_IMPORT{Import parcels} permission_PICKUP_MANAGE{Manage pickups} permission_HISTORY_VIEW{View operational history} permission_FINANCE_VIEW{View financial statements} permission_SETTLEMENT_REQUEST{Request settlements} activity_INVITATION_ISSUED{Invitation created} activity_INVITATION_ACCEPTED{Invitation accepted} activity_INVITATION_REVOKED{Invitation revoked} activity_EMPLOYEE_UPDATED{Employee access updated} activity_SETTLEMENT_REQUESTED{Settlement requested} activity_SETTLEMENT_REQUEST_REVIEWED{Settlement request reviewed} activity_PICKUP_ACCEPT_PROPOSAL{Pickup proposal accepted} activity_PICKUP_CANCEL{Pickup cancelled} activity_PICKUP_CONFIRM{Pickup confirmed} activity_PICKUP_PROPOSE{Pickup time proposed} activity_PICKUP_RECEIPT_RECORDED{Pickup receipt recorded} activity_recorded{Merchant activity recorded} parcel_create{Create parcel} parcel_edit{Edit parcel} parcel_save{Save changes} parcel_search{Search tracking number, recipient or reference} parcel_filter_status{Parcel status} parcel_all_statuses{All statuses} parcel_labels{Parcel labels} parcel_select{Select parcel} parcel_details{Parcel details} parcel_name_error{Enter a recipient name of 2–150 characters.} parcel_phone_error{Enter a valid phone number (6–30 characters).} parcel_address_error{Enter a detailed address of 3–500 characters.} parcel_amount_error{Enter a positive exact amount for COD, or zero for prepaid (up to 3 decimal places).} parcel_description_error{Enter a description up to 1000 characters.} parcel_pieces_error{Enter a whole piece count from 1 to 1000.} parcel_reference_error{Use a reference of up to 100 characters.} parcel_notes_error{Use notes of up to 1000 characters.} parcel_price_preview{Contractual pricing preview} parcel_final_amount{Final customer payment} parcel_base_fee{Base delivery fee} parcel_discount{Contractual discount} parcel_promotion{Promotion discount} parcel_delivery_fee{Contractual delivery fee} parcel_proceeds{Expected merchant proceeds} parcel_proceeds_note{Subject to collection and contractual charges.} parcel_choose_pin{Choose an optional location pin} parcel_remove_pin{Remove location pin} parcel_pin_help{Tap the intended location on the map, or enter coordinates, then confirm. The initial map view is Palestine.} parcel_latitude{Latitude} parcel_longitude{Longitude} parcel_pin_error{Enter both coordinates. Latitude must be −90 to 90 and longitude −180 to 180.} parcel_confirm_pin{Confirm selected location} parcel_no_zones{Your company has no active delivery zones. Contact the company before creating a parcel.} parcel_action_unavailable{This action is no longer available. Refresh parcel details to review its current state.} parcel_request_amendment{Request parcel amendment} parcel_amendment_help{The company must review pricing and approve this request before parcel facts change.} parcel_create_help{A created parcel remains with you until physical company receipt is confirmed.} parcel_amendment_reason{Amendment reason} parcel_reason_error{Enter a reason of 3–500 characters.} parcel_recipient{Recipient} parcel_recipient_name{Recipient name} parcel_phone{Phone} parcel_secondary_phone{Alternative phone (optional)} parcel_destination{Delivery destination} parcel_zone{City and delivery zone} parcel_zone_error{Choose an active delivery zone.} parcel_address{Detailed address} parcel_payment{Customer payment} parcel_collection_mode{Collection method} parcel_inclusive_help{Delivery is included in the final amount. It is never added on top. Currency follows your selected delivery zone.} parcel_prepaid_help{Customer pays zero. Contractual delivery charges still apply to the merchant.} parcel_preview_price{Preview contractual price} parcel_package{Package} parcel_description{Contents description} parcel_pieces{Pieces} parcel_reference{Merchant reference (optional)} parcel_notes{Delivery notes (optional)} parcel_price_required{Review a current pricing preview before saving.} parcel_uncertain_write{The result is not confirmed. Retry this exact submission or check the parcel list before starting another. Your original request identity is retained.} parcel_retry_write{Retry original submission} parcel_send_amendment{Send amendment request} parcel_date_unavailable{Date unavailable} parcel_cancel{Cancel parcel before receipt} parcel_request_cancellation{Request cancellation after receipt} parcel_cancellation_help{Company approval starts a documented return. It does not mean the parcel is physically back with you.} parcel_cancel_confirm{Confirm cancellation before physical company receipt?} parcel_current_location{Last confirmed operational location} parcel_label{Parcel label and QR code} parcel_cancel_reason{Cancellation reason} parcel_send_cancellation{Send cancellation request} parcel_requests{Company-reviewed requests} parcel_no_requests{No requests recorded.} parcel_timeline{Status timeline} parcel_no_events{No activity returned.} parcel_label_notice{The code identifies the parcel. Scanning does not authorize access or confirm physical receipt.} parcel_print_labels{Print labels} parcel_share_pdf{Share PDF} parcel_preview_pdf{Preview PDF} parcel_print_unavailable{Printing or sharing is not available on this device. You can still view the tracking QR code.} parcel_tracking_qr{Tracking QR code} refresh{Refresh} location_MERCHANT_ADDRESS{Merchant business address} location_WAREHOUSE{Recorded warehouse location} location_MANUAL{Company-recorded location} location_DRIVER{Recorded driver custody; not live GPS} location_WAREHOUSE_ADDRESS{Warehouse address} location_DELIVERY_ADDRESS{Recorded delivery address} location_PICKUP_ADDRESS{Recorded pickup address} status_INVITATION_ISSUED{Invitation issued} status_INVITATION_ACCEPTED{Invitation accepted} status_INVITATION_REVOKED{Invitation revoked} status_EMPLOYEE_UPDATED{Employee access updated} status_PICKUP_CONFIRM{Pickup window confirmed} status_PICKUP_PROPOSE{Alternative window proposed} status_PICKUP_CANCEL{Pickup cancelled} status_PICKUP_ACCEPT_PROPOSAL{Proposed window accepted} status_PICKUP_RECEIPT_RECORDED{Physical receipt recorded} status_SETTLEMENT_REQUESTED{Settlement requested} status_SETTLEMENT_REQUEST_REVIEWED{Settlement request reviewed} status_READY_FOR_DISPATCH{Ready for dispatch} status_FAILED_DELIVERY{Delivery unsuccessful} status_RESCHEDULED{Rescheduled} status_ON_HOLD{On hold} status_RECEIVED_FROM_MERCHANT{Received from merchant} status_RETURN_IN_PROGRESS{Return in progress} status_RETURNED_TO_WAREHOUSE{Returned to warehouse} status_RETURNED_TO_MERCHANT{Returned to merchant} status_COMPANY{Company custody} status_GOODS{Collected customer amount} status_DELIVERY_FEE{Delivery service charge} status_RETURN_FEE{Return service charge} status_ADJUSTMENT{Accounting adjustment} status_REVERSAL{Reversal} status_OWNER{Merchant owner} status_EMPLOYEE{Merchant employee} status_MERCHANT_PARCEL_CREATED{Merchant created parcel} status_MERCHANT_PARCEL_EDITED{Parcel amended} status_MERCHANT_PARCEL_CANCELLED{Merchant cancelled parcel} status_PICKUP_REQUESTED{Pickup requested} status_PHYSICAL_RECEIPT_CONFIRMED{Physical receipt confirmed} status_STATUS_CHANGED{Status changed} status_DRIVER_ASSIGNED{Driver assigned} status_DELIVERY_ATTEMPT{Delivery attempt} status_COD_COLLECTED{Customer amount collected} status_CASH_REMITTED{Cash remitted to company} status_MERCHANT_AMEND_REQUESTED{Amendment requested} status_MERCHANT_CANCEL_REQUESTED{Cancellation requested} status_MERCHANT_REQUEST_APPROVED{Company approved request} status_MERCHANT_REQUEST_REJECTED{Company rejected request} status_PARCEL_CREATED{Parcel created} status_PARCEL_EDITED{Parcel edited} status_CUSTODY_RECORDED{Custody recorded} status_RETURN_INITIATED{Return initiated} location_CONFIRMED_RECEIPT{Confirmed physical receipt} location_VERIFIED_DELIVERY{Verified delivery location} location_VERIFIED_RETURN_HANDOFF{Verified return handoff} location_OPERATIONAL_EVENT{Last recorded operational event} parcel_document_error{Could not generate or open the document. Try again or use another available print/share option.} pickup_title{Pickup requests} pickup_new{New pickup request} pickup_details{Pickup details} pickup_method{Handover method} pickup_method_COMPANY_PICKUP{Company pickup} pickup_method_WAREHOUSE_DROPOFF{Warehouse drop-off} pickup_receiptNotice{Parcels remain in your custody until the company confirms physical receipt.} pickup_preferred{Preferred window} pickup_proposed{Company proposal} pickup_confirmed{Confirmed window} pickup_notScheduled{Not scheduled} pickup_preferenceNotice{Choose a future time window. This is a preference until the company confirms it.} pickup_from{From} pickup_to{To} pickup_alternate{Use an alternative address} pickup_alternateNotice{Applies to this request only. Your business address stays the same.} pickup_address{Alternative pickup address} pickup_addressInvalid{Enter an address of at least 3 characters.} pickup_notes{Pickup notes (optional)} pickup_parcels{Selected parcels} pickup_readyNotice{Select up to 200 ready parcels. The company checks that parcels are not already in another active request.} pickup_chooseParcels{Select between 1 and 200 parcels.} pickup_windowInvalid{Choose a future start time and an end time after it.} pickup_submit{Request pickup} pickup_retrySame{Retry this request} pickup_uncertain{The request was not confirmed. Retry the same request to check its outcome without creating a duplicate.} pickup_denied{You do not have permission to manage pickup requests.} pickup_parcelPermission{Parcel viewing permission is required to select parcels. Contact the business owner.} pickup_cancel{Cancel pickup request} pickup_accept{Accept proposed window} pickup_cancelMessage{Cancel this grouped pickup request? No physical receipt will be recorded.} pickup_acceptMessage{Confirm the time window proposed by the company?} pickup_refresh{Refresh request} pickup_receipt_PENDING{Awaiting physical receipt} pickup_receipt_RECEIVED{Received by the company} pickup_receipt_MISSING{Not received} pickup_receipt_DISCREPANT{Received with a discrepancy} deliveryCompany{Delivery company} accountRole{Account role} merchantOwner{Merchant owner} merchantEmployee{Merchant employee} contactPhone{Contact phone} defaultPickupLocation{Default pickup location} alternatePickupHelp{Use an alternate location on a pickup request when needed.} settlementExplanation{Requests are reviewed by your delivery company. A request does not confirm payment or move money.} requestSettlement{Request settlement} settlementConfirmation{Send this settlement request to your delivery company for review? This does not confirm payment.} settlementHistory{Request history} refreshSettlements{Refresh requests} settlementRecorded{Settlement request recorded} newSettlementRequest{Create another request} noSettlementCurrency{No balance currencies are available for a settlement request yet.} settlementCurrency{Currency} settlementNotes{Notes (optional)} settlementRetryHelp{The result is uncertain. Retry this same request to check or complete it safely. Its currency and notes are preserved.} sendSettlementRequest{Send settlement request} retrySettlementRequest{Retry the same request} other{Not available}}'**
  String text(String key);
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
