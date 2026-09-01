# Migration 0017: destination province

Migration `0017_quiet_viper.sql` adds `orders.destination_province` for Canadian sales reporting.
It remains nullable so a malformed provider address cannot prevent a verified paid order from being
recorded.

## Deployment

The migration is additive and safe to run before the new application deploys. It backfills valid
Canadian province and territory codes from the stored Stripe address. For an order converted from
local delivery to shipping, it prefers the latest paid supplemental shipping address.

The backfill ignores missing, foreign, and unrecognized address regions. It does not guess or print
customer addresses. New application writes normalize known Canadian codes and leave anything else
null for the later tax-reporting audit.

After deployment, verify aggregate counts only:

```sql
SELECT destination_province, COUNT(*)
FROM orders
GROUP BY destination_province
ORDER BY destination_province;
```

A null count is not a migration failure. It identifies historical or provider data that needs
manual review before province-based tax reporting can treat the dataset as complete.

## Rollback

Deploy the previous application first. The new application reads and writes this column, so dropping
it while the new version is serving traffic would break paid-order persistence. After rollback, the
index, check constraint, and column can be removed in a reviewed follow-up migration. Keeping the
unused nullable column is also safe.
