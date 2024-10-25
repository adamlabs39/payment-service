import BillModel from "./bill-model.js";
import BillItemModel from "./bill-item-model.js";
import FaskesProfilesModel from "./faskes-profiles-model.js";
import PaymentHistoryModel from "./payment-history-model.js";
import ServiceBillModel from "./service-bill-model.js";

const MODEL_MERGE = [
    BillModel,
    BillItemModel,
    FaskesProfilesModel,
    PaymentHistoryModel,
    ServiceBillModel
];


export default MODEL_MERGE;