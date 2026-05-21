import type { Preview } from '@storybook/nextjs-vite';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'mocha',
      values: [
        { name: 'mocha', value: 'hsl(240 23% 9%)' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    a11y: {
      test: 'todo',
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-6">
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default preview;
