import type { ImageSourcePropType } from 'react-native';

// Gallery thumbnails: the sample resume rendered by the existing renderer
// (templateSampleHtml) and captured at build time. Regenerate with
// `npm run thumbnails`; a test fails when a template's output changes and the
// images were not regenerated. The large template preview renders live instead.

export const THUMBNAIL_ASPECT = 8.5 / 11;

const THUMBNAILS: Record<string, ImageSourcePropType> = {
  'corporate-boardroom': require('../../../assets/templates/corporate-boardroom.png'),
  'corporate-partner': require('../../../assets/templates/corporate-partner.png'),
  'tech-builder': require('../../../assets/templates/tech-builder.png'),
  'tech-architect': require('../../../assets/templates/tech-architect.png'),
  'creative-editorial': require('../../../assets/templates/creative-editorial.png'),
  'creative-studio': require('../../../assets/templates/creative-studio.png'),
  'healthcare-practitioner': require('../../../assets/templates/healthcare-practitioner.png'),
  'healthcare-educator': require('../../../assets/templates/healthcare-educator.png'),
  'academic-scholar': require('../../../assets/templates/academic-scholar.png'),
  'academic-researcher': require('../../../assets/templates/academic-researcher.png'),
  'trades-operator': require('../../../assets/templates/trades-operator.png'),
  'trades-foreman': require('../../../assets/templates/trades-foreman.png'),
};

export const thumbnailFor = (templateId: string): ImageSourcePropType | undefined => THUMBNAILS[templateId];
