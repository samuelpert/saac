import type { Config } from '../config';
import type { Db } from '../db';
import { AuthService } from './auth.service';
import { BooksService, type Fetcher } from './books.service';
import { BorrowersService } from './borrowers.service';
import { DashboardService } from './dashboard.service';
import { InventoryService } from './inventory.service';
import { ItemsService } from './items.service';
import { LoansService } from './loans.service';
import { StudentImportService } from './studentImport/service';
import { TermsService } from './terms.service';
import { UsersService } from './users.service';

export type Services = ReturnType<typeof createServices>;

export function createServices(
  db: Db,
  config: Pick<Config, 'SESSION_IDLE_MINUTES' | 'BACKUP_STALE_HOURS' | 'BACKUP_DIR'> & { OPEN_LIBRARY_LOOKUP?: boolean },
  opts: { fetcher?: Fetcher } = {},
) {
  const terms = new TermsService(db);
  return {
    db,
    auth: new AuthService(db, config.SESSION_IDLE_MINUTES),
    users: new UsersService(db),
    terms,
    borrowers: new BorrowersService(db, terms),
    loans: new LoansService(db),
    items: new ItemsService(db),
    inventory: new InventoryService(db),
    books: new BooksService(db, { openLibrary: config.OPEN_LIBRARY_LOOKUP ?? true, fetcher: opts.fetcher }),
    studentImport: new StudentImportService(db),
    dashboard: new DashboardService(db, terms, { backupStaleHours: config.BACKUP_STALE_HOURS, diskPath: config.BACKUP_DIR }),
  };
}
