import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProgressCard } from "./progress-card";

const meta = {
  title: "Dashboard/ProgressCard",
  component: ProgressCard,
} satisfies Meta<typeof ProgressCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: {
    job: {
      status: "pending",
      done: 0,
      failed: 0,
      total: 15,
      batchesCompleted: 0,
      batchesTotal: 1,
    },
  },
};

export const ProcessingMidway: Story = {
  args: {
    job: {
      status: "processing",
      done: 10,
      failed: 0,
      total: 15,
      batchesCompleted: 0,
      batchesTotal: 1,
    },
  },
};

export const ProcessingWithFailures: Story = {
  args: {
    job: {
      status: "processing",
      done: 60,
      failed: 5,
      total: 100,
      batchesCompleted: 2,
      batchesTotal: 4,
    },
  },
};

export const NearlyDone: Story = {
  args: {
    job: {
      status: "processing",
      done: 95,
      failed: 2,
      total: 100,
      batchesCompleted: 3,
      batchesTotal: 4,
    },
  },
};
