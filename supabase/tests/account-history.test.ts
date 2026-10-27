import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

import { accountHistory, transactionAccountChange, type AccountMovement } from "../../src/lib/account-history";
import { asUser, createTestDb, createUser } from "./test-db";

const USER = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";
let db: PGlite;
beforeAll(async () => { db = await createTestDb(); await createUser(db, USER); await createUser(db, OTHER); });
afterAll(async () => { await db.close(); });

it("reconciles Cash, MoMo, Bank, school funds and fees with the database balance view", async () => {
  await asUser(db, USER, async () => {
    const account = async (name: string, opening: number) => (await db.query<{id: string}>("insert into public.accounts(name,type,currency,opening_balance_minor,opening_balance_on) values ($1,'cash','GHS',$2,'2026-10-01') returning id", [name, opening])).rows[0].id;
    const cash = await account("Cash", -4700);
    const momo = await account("MoMo", 6443);
    const bank = await account("Bank", 0);
    const category = (await db.query<{id: string}>("insert into public.categories(kind,name) values ('income','Other income') returning id")).rows[0].id;
    await db.query("insert into public.school_settings(account_id,income_category_id) values ($1,$2)", [cash, category]);
    await db.query("insert into public.mc_days(day, full_1) values ('2026-10-27',159)");
    for (const amount of [180000, 70000]) await db.query("insert into public.transactions(kind,occurred_on,account_id,category_id,amount_minor,currency,amount_ghs_minor,account_amount_minor) values ('income','2026-10-27',$1,$2,$3,'GHS',$3,$3)", [cash, category, amount]);
    const transfer = async (from: string, to: string, amount: number, fee: number) => db.query("select public.save_transfer(null,'2026-10-27',$1,$2,$3,$3,'GHS',1,'none',null,$3,$4,$4,'')", [from,to,amount,fee]);
    await transfer(cash,momo,100000,0);
    await transfer(momo,bank,80000,600);
    const balances = (await db.query<{account_id: string; balance_minor: number}>("select * from public.account_balances")).rows;
    const expected = new Map([[cash,193000],[momo,25843],[bank,80000]]);
    for (const {account_id, balance_minor} of balances) {
      const tx = (await db.query<{id:string; occurred_on:string; account_id:string;kind:"income"|"expense"|"transfer";account_amount_minor:number;to_amount_minor:number|null}>("select id,occurred_on::text,account_id,kind,account_amount_minor,to_amount_minor from public.transactions where account_id=$1 or to_account_id=$1",[account_id])).rows;
      const school = (await db.query<{occurred_on:string;amount_minor:number}>("select occurred_on::text,amount_minor from public.school_cash_moves where account_id=$1",[account_id])).rows;
      const movements: AccountMovement[] = tx.map(row => ({id:row.id,date:row.occurred_on,amountMinor:transactionAccountChange(account_id,row),school:false,label:"transaction",href:"/activity"}));
      school.forEach((row,i) => movements.push({id:`school-${i}`,date:row.occurred_on,amountMinor:row.amount_minor,school:true,label:"school",href:"/school"}));
      const opening = account_id === cash ? -4700 : account_id === momo ? 6443 : 0;
      const history = accountHistory(opening,"2026-10-01",movements);
      expect(Number(balance_minor)).toBe(expected.get(account_id));
      expect(history.balanceMinor).toBe(Number(balance_minor));
      if (account_id === cash) { expect(history.schoolHeldMinor).toBe(47700); expect(history.personalMinor).toBe(145300); }
    }
  });
  await asUser(db, OTHER, async () => {
    expect((await db.query("select * from public.school_cash_moves")).rows).toEqual([]);
    expect((await db.query("select * from public.transactions")).rows).toEqual([]);
    expect((await db.query("select * from public.account_balances")).rows).toEqual([]);
  });
});
