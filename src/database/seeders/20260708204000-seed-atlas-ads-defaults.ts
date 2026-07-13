import type { QueryInterface } from 'sequelize';

module.exports = {
  async up(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.bulkInsert('ad_inventory_placements', [
      {
        code: 'MERCHANT_DASHBOARD_TOP_BANNER',
        surface: 'MERCHANT_PORTAL',
        placement_type: 'IMAGE_BANNER',
        allowed_formats_json: JSON.stringify(['IMAGE_BANNER']),
        billing_model: 'CPM',
        width_px: 1200,
        height_px: 250,
        supports_video: false,
        pricing_floor_cpm_micros: 2500000,
        is_active: true,
      },
      {
        code: 'MERCHANT_PORTAL_SIDE_CARD',
        surface: 'MERCHANT_PORTAL',
        placement_type: 'TEXT_CARD',
        allowed_formats_json: JSON.stringify(['TEXT_CARD', 'IMAGE_BANNER']),
        billing_model: 'CPC',
        width_px: 360,
        height_px: 280,
        supports_video: false,
        pricing_floor_cpm_micros: 1500000,
        is_active: true,
      },
    ]);

    await queryInterface.bulkInsert('ad_policy_rules', [
      {
        policy_code: 'NO_UNVERIFIED_FINANCIAL_CLAIMS',
        category: 'FINANCIAL_CLAIMS',
        rule_type: 'MANUAL_REVIEW_REQUIRED',
        severity: 'HIGH',
        description:
          'No permitir promesas financieras, crédito, inversión o rentabilidad sin evidencia verificable y revisión de compliance.',
        is_active: true,
      },
      {
        policy_code: 'NO_SENSITIVE_TARGETING',
        category: 'PRIVACY',
        rule_type: 'AUTO_REJECT',
        severity: 'CRITICAL',
        description:
          'Rechazar campañas que usen segmentación sensible o datos personales no autorizados.',
        is_active: true,
      },
    ]);
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.bulkDelete('ad_policy_rules', {
      policy_code: ['NO_UNVERIFIED_FINANCIAL_CLAIMS', 'NO_SENSITIVE_TARGETING'],
    });
    await queryInterface.bulkDelete('ad_inventory_placements', {
      code: ['MERCHANT_DASHBOARD_TOP_BANNER', 'MERCHANT_PORTAL_SIDE_CARD'],
    });
  },
};
