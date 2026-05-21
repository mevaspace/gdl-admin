import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PrimaryActionButton } from "./primary-action-button";

const meta = {
  title: "Dashboard/PrimaryActionButton",
  component: PrimaryActionButton,
  args: { onClick: () => console.log("click") },
} satisfies Meta<typeof PrimaryActionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoDocs: Story = {
  args: { label: "Proses 0 dokumen", variant: "filled", disabled: true },
};

export const Idle: Story = {
  args: { label: "Proses 15 dokumen", variant: "filled" },
};

export const Pending: Story = {
  args: { label: "Menunggu QStash...", variant: "filled", disabled: true },
};

export const Processing: Story = {
  args: { label: "Memproses 10/15...", variant: "filled", disabled: true },
};

export const Done: Story = {
  args: { label: "Proses job baru", variant: "outline" },
};

export const Failed: Story = {
  args: { label: "Coba lagi", variant: "outline" },
};
