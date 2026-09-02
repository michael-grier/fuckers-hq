ALTER TYPE "public"."order_email_kind" ADD VALUE 'refund' BEFORE 'shipped';--> statement-breakpoint
DROP INDEX "order_email_deliveries_order_id_kind_unique";--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD COLUMN "refund_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD COLUMN "refund_cumulative_cents" integer;--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD CONSTRAINT "order_email_deliveries_order_kind_refund_unique" UNIQUE NULLS NOT DISTINCT("order_id","kind","refund_cumulative_cents");--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD CONSTRAINT "order_email_deliveries_refund_snapshot_consistent" CHECK ((
        "order_email_deliveries"."kind"::text = 'refund'
        AND "order_email_deliveries"."refund_amount_cents" IS NOT NULL
        AND "order_email_deliveries"."refund_cumulative_cents" IS NOT NULL
        AND "order_email_deliveries"."refund_amount_cents" > 0
        AND "order_email_deliveries"."refund_cumulative_cents" >= "order_email_deliveries"."refund_amount_cents"
      ) OR (
        "order_email_deliveries"."kind"::text <> 'refund'
        AND "order_email_deliveries"."refund_amount_cents" IS NULL
        AND "order_email_deliveries"."refund_cumulative_cents" IS NULL
      ));
