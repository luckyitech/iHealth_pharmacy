import baseConfig from '@ihealth/config/eslint';
import reactConfig from '@ihealth/config/eslint-react';

export default [...baseConfig, ...reactConfig(['apps/web/**/*.{js,jsx}'])];
