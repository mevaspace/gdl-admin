import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ResultsCard } from "./results-card";

const meta = {
  title: "Dashboard/ResultsCard",
  component: ResultsCard,
  args: { onDownloadAll: (p) => console.log("download all", p) },
} satisfies Meta<typeof ResultsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const part = (i: number, count = 30, failed = 0) => ({
  batchIndex: i,
  blobUrl: `https://example.blob.vercel-storage.com/bulk/2026-05-21/job-x/part-${String(i).padStart(3, "0")}.zip`,
  count,
  failed,
});

export const SingleBatch: Story = {
  args: {
    parts: [part(0, 15)],
    done: 15,
    total: 15,
    failed: 0,
  },
};

export const MultiBatch: Story = {
  args: {
    parts: [part(0), part(1), part(2), part(3)],
    done: 120,
    total: 120,
    failed: 0,
  },
};

export const WithFailures: Story = {
  args: {
    parts: [part(0, 28, 2), part(1, 25, 5), part(2, 30, 0)],
    done: 83,
    total: 90,
    failed: 7,
  },
};

export const LargeMultiBatch: Story = {
  args: {
    parts: Array.from({ length: 10 }, (_, i) => part(i, 30, i % 3 === 0 ? 1 : 0)),
    done: 297,
    total: 300,
    failed: 3,
  },
};
