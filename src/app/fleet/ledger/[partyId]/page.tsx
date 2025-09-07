
import { getParty } from '@/services/party-service';
import { getTransactionsForParty } from '@/services/transaction-service';
import LedgerClientPage from './_components/ledger-client-page';
import { getAccounts } from '@/services/account-service';

export default async function PartyLedgerPage({ params }: { params: { partyId: string } }) {
  const { partyId } = params;

  const [party, transactions, accounts] = await Promise.all([
    getParty(partyId),
    getTransactionsForParty(partyId),
    getAccounts(),
  ]);

  if (!party) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">Party Not Found</h3>
            <p className="text-sm text-muted-foreground">The requested customer or vendor could not be found.</p>
        </div>
      </div>
    );
  }

  return <LedgerClientPage initialParty={party} initialTransactions={transactions} initialAccounts={accounts} />;
}
