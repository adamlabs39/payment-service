import { z } from 'zod';
export default class CashierValidation {
  static OPEN_SHIFT = z.object({
    beginning_balance: z
      .number({
        errorMap: () => ({ message: 'Saldo awal harus diisi' }),
      })
      .int({ message: 'Saldo harus lebih dari 0' })
      .positive({ message: 'Saldo harus lebih dari 0' }),
    shift_type: z.enum(['1', '2', '3'], {
      errorMap: () => ({ message: 'Shift harus dipilih' }),
    }),
  });

  static CLOSE_SHIFT = z.object({
    cash: z
      .number({
        errorMap: () => ({ message: 'Pendapatan shift kasir (cash) harus diisi' }),
      })
      .min(0),
    // debit: z
    //   .number({
    //     errorMap: () => ({ message: 'Pendapatan shift kasir (debit) harus diisi' }),
    //   })
    //   .min(0),
    // insurance: z
    //   .number({
    //     errorMap: () => ({ message: 'Pendapatan shift kasir (asuransi) harus diisi' }),
    //   })
    //   .min(0),
  });
}
