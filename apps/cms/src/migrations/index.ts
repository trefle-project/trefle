import * as migration_20260909_114748_initial from './20260909_114748_initial';
import * as migration_20260909_120606_phase2_foundational from './20260909_120606_phase2_foundational';
import * as migration_20260909_125135_phase3_us1 from './20260909_125135_phase3_us1';
import * as migration_20260909_132641_phase3b_drop_baseupdatedat from './20260909_132641_phase3b_drop_baseupdatedat';
import * as migration_20260909_140324_phase5_dsr from './20260909_140324_phase5_dsr';
import * as migration_20260909_140833_phase5b_dsr_email_nullable from './20260909_140833_phase5b_dsr_email_nullable';
import * as migration_20260909_142443_phase6_retention_jobs from './20260909_142443_phase6_retention_jobs';
import * as migration_20260909_144132_phase7_users_invitation_status from './20260909_144132_phase7_users_invitation_status';
import * as migration_20260911_090929_phase9_confirmation_page from './20260911_090929_phase9_confirmation_page';
import * as migration_20260911_111957_phase_page_type from './20260911_111957_phase_page_type';
import * as migration_20260913_181446_phase_content_language from './20260913_181446_phase_content_language';
import * as migration_20260913_191352_phase_optin_email from './20260913_191352_phase_optin_email';
import * as migration_20260916_065817_gtm_tagging from './20260916_065817_gtm_tagging';
import * as migration_20260916_165339_ab_testing from './20260916_165339_ab_testing';
import * as migration_20260926_090000_form_field_types from './20260926_090000_form_field_types';
import * as migration_20260927_115510_page_imports from './20260927_115510_page_imports';
import * as migration_20260928_075516_page_imports_file_source from './20260928_075516_page_imports_file_source';
import * as migration_20260930_173045_custom_code from './20260930_173045_custom_code';
import * as migration_20261006_141655_domain_fonts from './20261006_141655_domain_fonts';
import * as migration_20261006_175203_site_imports from './20261006_175203_site_imports';
import * as migration_20261009_180337_media_previous_filenames from './20261009_180337_media_previous_filenames';
import * as migration_20261012_113606_edge_view_windows from './20261012_113606_edge_view_windows';
import * as migration_20261016_092526_admin_access from './20261016_092526_admin_access';
import * as migration_20261016_113226_edge_access from './20261016_113226_edge_access';
import * as migration_20261019_185520_ab_significance from './20261019_185520_ab_significance';
import * as migration_20261021_101738_legal_pages from './20261021_101738_legal_pages';
import * as migration_20261023_095758_display_timezone from './20261023_095758_display_timezone';
import * as migration_20261023_102637_page_stats_hourly from './20261023_102637_page_stats_hourly';
import * as migration_20261023_111940_admin_images_branding_avatar from './20261023_111940_admin_images_branding_avatar';
import * as migration_20261023_140652_settings_veil_opacity from './20261023_140652_settings_veil_opacity';
import * as migration_20261023_142045_admin_branding_defaults from './20261023_142045_admin_branding_defaults';
import * as migration_20261028_113848_admin_language from './20261028_113848_admin_language';
import * as migration_20261028_160000_english_public_paths from './20261028_160000_english_public_paths';
import * as migration_20261029_140347_import_report_language from './20261029_140347_import_report_language';
import * as migration_20261029_143638_visitor_submit_label from './20261029_143638_visitor_submit_label';

export const migrations = [
  {
    up: migration_20260909_114748_initial.up,
    down: migration_20260909_114748_initial.down,
    name: '20260909_114748_initial',
  },
  {
    up: migration_20260909_120606_phase2_foundational.up,
    down: migration_20260909_120606_phase2_foundational.down,
    name: '20260909_120606_phase2_foundational',
  },
  {
    up: migration_20260909_125135_phase3_us1.up,
    down: migration_20260909_125135_phase3_us1.down,
    name: '20260909_125135_phase3_us1',
  },
  {
    up: migration_20260909_132641_phase3b_drop_baseupdatedat.up,
    down: migration_20260909_132641_phase3b_drop_baseupdatedat.down,
    name: '20260909_132641_phase3b_drop_baseupdatedat',
  },
  {
    up: migration_20260909_140324_phase5_dsr.up,
    down: migration_20260909_140324_phase5_dsr.down,
    name: '20260909_140324_phase5_dsr',
  },
  {
    up: migration_20260909_140833_phase5b_dsr_email_nullable.up,
    down: migration_20260909_140833_phase5b_dsr_email_nullable.down,
    name: '20260909_140833_phase5b_dsr_email_nullable',
  },
  {
    up: migration_20260909_142443_phase6_retention_jobs.up,
    down: migration_20260909_142443_phase6_retention_jobs.down,
    name: '20260909_142443_phase6_retention_jobs',
  },
  {
    up: migration_20260909_144132_phase7_users_invitation_status.up,
    down: migration_20260909_144132_phase7_users_invitation_status.down,
    name: '20260909_144132_phase7_users_invitation_status',
  },
  {
    up: migration_20260911_090929_phase9_confirmation_page.up,
    down: migration_20260911_090929_phase9_confirmation_page.down,
    name: '20260911_090929_phase9_confirmation_page',
  },
  {
    up: migration_20260911_111957_phase_page_type.up,
    down: migration_20260911_111957_phase_page_type.down,
    name: '20260911_111957_phase_page_type',
  },
  {
    up: migration_20260913_181446_phase_content_language.up,
    down: migration_20260913_181446_phase_content_language.down,
    name: '20260913_181446_phase_content_language',
  },
  {
    up: migration_20260913_191352_phase_optin_email.up,
    down: migration_20260913_191352_phase_optin_email.down,
    name: '20260913_191352_phase_optin_email',
  },
  {
    up: migration_20260916_065817_gtm_tagging.up,
    down: migration_20260916_065817_gtm_tagging.down,
    name: '20260916_065817_gtm_tagging',
  },
  {
    up: migration_20260916_165339_ab_testing.up,
    down: migration_20260916_165339_ab_testing.down,
    name: '20260916_165339_ab_testing',
  },
  {
    up: migration_20260926_090000_form_field_types.up,
    down: migration_20260926_090000_form_field_types.down,
    name: '20260926_090000_form_field_types',
  },
  {
    up: migration_20260927_115510_page_imports.up,
    down: migration_20260927_115510_page_imports.down,
    name: '20260927_115510_page_imports',
  },
  {
    up: migration_20260928_075516_page_imports_file_source.up,
    down: migration_20260928_075516_page_imports_file_source.down,
    name: '20260928_075516_page_imports_file_source',
  },
  {
    up: migration_20260930_173045_custom_code.up,
    down: migration_20260930_173045_custom_code.down,
    name: '20260930_173045_custom_code',
  },
  {
    up: migration_20261006_141655_domain_fonts.up,
    down: migration_20261006_141655_domain_fonts.down,
    name: '20261006_141655_domain_fonts',
  },
  {
    up: migration_20261006_175203_site_imports.up,
    down: migration_20261006_175203_site_imports.down,
    name: '20261006_175203_site_imports',
  },
  {
    up: migration_20261009_180337_media_previous_filenames.up,
    down: migration_20261009_180337_media_previous_filenames.down,
    name: '20261009_180337_media_previous_filenames',
  },
  {
    up: migration_20261012_113606_edge_view_windows.up,
    down: migration_20261012_113606_edge_view_windows.down,
    name: '20261012_113606_edge_view_windows',
  },
  {
    up: migration_20261016_092526_admin_access.up,
    down: migration_20261016_092526_admin_access.down,
    name: '20261016_092526_admin_access',
  },
  {
    up: migration_20261016_113226_edge_access.up,
    down: migration_20261016_113226_edge_access.down,
    name: '20261016_113226_edge_access',
  },
  {
    up: migration_20261019_185520_ab_significance.up,
    down: migration_20261019_185520_ab_significance.down,
    name: '20261019_185520_ab_significance',
  },
  {
    up: migration_20261021_101738_legal_pages.up,
    down: migration_20261021_101738_legal_pages.down,
    name: '20261021_101738_legal_pages',
  },
  {
    up: migration_20261023_095758_display_timezone.up,
    down: migration_20261023_095758_display_timezone.down,
    name: '20261023_095758_display_timezone',
  },
  {
    up: migration_20261023_102637_page_stats_hourly.up,
    down: migration_20261023_102637_page_stats_hourly.down,
    name: '20261023_102637_page_stats_hourly',
  },
  {
    up: migration_20261023_111940_admin_images_branding_avatar.up,
    down: migration_20261023_111940_admin_images_branding_avatar.down,
    name: '20261023_111940_admin_images_branding_avatar',
  },
  {
    up: migration_20261023_140652_settings_veil_opacity.up,
    down: migration_20261023_140652_settings_veil_opacity.down,
    name: '20261023_140652_settings_veil_opacity',
  },
  {
    up: migration_20261023_142045_admin_branding_defaults.up,
    down: migration_20261023_142045_admin_branding_defaults.down,
    name: '20261023_142045_admin_branding_defaults',
  },
  {
    up: migration_20261028_113848_admin_language.up,
    down: migration_20261028_113848_admin_language.down,
    name: '20261028_113848_admin_language',
  },
  {
    up: migration_20261028_160000_english_public_paths.up,
    down: migration_20261028_160000_english_public_paths.down,
    name: '20261028_160000_english_public_paths',
  },
  {
    up: migration_20261029_140347_import_report_language.up,
    down: migration_20261029_140347_import_report_language.down,
    name: '20261029_140347_import_report_language',
  },
  {
    up: migration_20261029_143638_visitor_submit_label.up,
    down: migration_20261029_143638_visitor_submit_label.down,
    name: '20261029_143638_visitor_submit_label'
  },
];
