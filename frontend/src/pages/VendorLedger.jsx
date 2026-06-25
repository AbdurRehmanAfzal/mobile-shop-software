// Vendor Ledger - View and manage vendor purchases and payments
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import BilingualInput from '../components/BilingualInput';
import PaymentModal from '../components/PaymentModal';
import { suppliesAPI, partiesAPI } from '../services/api';

const VendorLedger = () => {
  const { t } = useTranslation();
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState(null);

  // Load vendors on mount
  useEffect(() => {
    loadVendors();
  }, []);

  // Load vendor-specific ledger when vendor is selected
  useEffect(() => {
    if (selectedVendor) {
      loadVendorLedger(selectedVendor);
    }
  }, [selectedVendor]);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const result = await partiesAPI.getSuppliers();
      if (result.success) {
        setVendors(result.data || []);
        setError(null);
      } else {
        setError(result.error || 'Failed to load vendors');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadVendorLedger = async (vendorId) => {
    try {
      setLoading(true);
      const result = await suppliesAPI.getByVendor(vendorId);
      if (result.success) {
        setLedgerData(result.data);
        setError(null);
      } else {
        setError(result.error || 'Failed to load vendor ledger');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentClick = (supply) => {
    setSelectedSupply(supply);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    setSuccess('Payment recorded successfully!');
    setShowPaymentModal(false);
    setSelectedSupply(null);
    // Reload ledger to reflect payment
    if (selectedVendor) {
      loadVendorLedger(selectedVendor);
    }
    // Clear success message after 3 seconds
    setTimeout(() => setSuccess(null), 3000);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Vendor Ledger"
          ur="فروخت کار کا بہی خاتہ"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
        <p className="text-gray-600 mt-2">
          {t('Track vendor purchases, payments, and outstanding balances')}
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <BilingualAlert
          en={error}
          ur={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}

      {/* Success Alert */}
      {success && (
        <BilingualAlert
          en={success}
          ur={success}
          type="success"
          onClose={() => setSuccess(null)}
        />
      )}

      {/* Vendor Selection */}
      <div className="card mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          <span className="en">Select Vendor / Supplier</span>
          <span className="ur">فروخت کار / سپلائی کار منتخب کریں</span>
        </label>
        <select
          value={selectedVendor || ''}
          onChange={(e) => setSelectedVendor(parseInt(e.target.value) || null)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">
            <span className="en">Choose a vendor...</span>
            <span className="ur">فروخت کار منتخب کریں...</span>
          </option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name} {vendor.phone ? `(${vendor.phone})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="spinner text-4xl inline-block"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      )}

      {/* Vendor Ledger Display */}
      {!loading && ledgerData && (
        <>
          {/* Vendor Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <SummaryCard
              en="Total Purchases"
              ur="کل خریداری"
              value={`Rs. ${ledgerData.total_amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              color="blue"
            />
            <SummaryCard
              en="Total Paid"
              ur="کل ادائیگی"
              value={`Rs. ${ledgerData.total_paid.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              color="green"
            />
            <SummaryCard
              en="Outstanding Balance"
              ur="باقی رقم"
              value={`Rs. ${ledgerData.outstanding_balance.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              color={ledgerData.outstanding_balance > 0 ? 'red' : 'gray'}
            />
            <SummaryCard
              en="Total Transactions"
              ur="کل لین دین"
              value={ledgerData.supplies_count}
              color="purple"
            />
          </div>

          {/* Vendor Contact Info */}
          <div className="card mb-6 bg-blue-50 border-l-4 border-blue-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase">
                  <span className="en">Vendor Name</span>
                  <span className="ur">فروخت کار کا نام</span>
                </p>
                <p className="font-semibold text-gray-900">{ledgerData.vendor_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">
                  <span className="en">Phone</span>
                  <span className="ur">فون</span>
                </p>
                <p className="font-semibold text-gray-900 ltr">{ledgerData.vendor_phone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">
                  <span className="en">Type</span>
                  <span className="ur">قسم</span>
                </p>
                <p className="font-semibold text-gray-900">{ledgerData.vendor_type}</p>
              </div>
            </div>
          </div>

          {/* Purchase History Table */}
          <div className="card">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              <span className="en">Purchase History</span>
              <span className="ur">خریداری کی تاریخ</span>
            </h3>

            {ledgerData.supplies && ledgerData.supplies.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b-2 border-gray-300">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">
                        <span className="en">Date</span>
                        <span className="ur">تاریخ</span>
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">
                        <span className="en">Amount</span>
                        <span className="ur">رقم</span>
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">
                        <span className="en">Paid</span>
                        <span className="ur">ادا کی گئی</span>
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">
                        <span className="en">Credit</span>
                        <span className="ur">قرض</span>
                      </th>
                      <th className="px-4 py-2 text-center font-semibold text-gray-700">
                        <span className="en">Status</span>
                        <span className="ur">حالت</span>
                      </th>
                      <th className="px-4 py-2 text-center font-semibold text-gray-700">
                        <span className="en">Items</span>
                        <span className="ur">اشیاء</span>
                      </th>
                      <th className="px-4 py-2 text-center font-semibold text-gray-700">
                        <span className="en">Action</span>
                        <span className="ur">عمل</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.supplies.map((supply) => (
                      <tr key={supply.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {new Date(supply.created_at).toLocaleDateString('en-PK')}
                          <br />
                          <span className="text-xs text-gray-500">
                            {new Date(supply.created_at).toLocaleTimeString('en-PK', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 ltr">
                          Rs. {supply.total_amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-3 text-right text-green-700 font-semibold ltr">
                          Rs. {supply.amount_paid.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ltr ${
                          supply.credit_amount > 0 ? 'text-red-700' : 'text-gray-500'
                        }`}>
                          Rs. {supply.credit_amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={supply.payment_status} />
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {supply.item_count}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {supply.credit_amount > 0 ? (
                            <button
                              onClick={() => handlePaymentClick(supply)}
                              className="text-blue-600 hover:text-blue-800 font-semibold text-sm"
                            >
                              <span className="en">Pay</span>
                              <span className="ur">ادا کریں</span>
                            </button>
                          ) : (
                            <span className="text-green-600 font-semibold text-sm">
                              <span className="en">Paid</span>
                              <span className="ur">ادا</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">
                  <span className="en">No purchase records found for this vendor</span>
                  <span className="ur">اس فروخت کار کے لیے کوئی خریداری ریکارڈ نہیں ملا</span>
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* No Vendor Selected */}
      {!loading && !ledgerData && !error && (
        <div className="card text-center py-12">
          <p className="text-gray-500 text-lg">
            <span className="en">Select a vendor to view their purchase history and outstanding balance</span>
            <span className="ur">ان کی خریداری کی تاریخ اور باقی رقم دیکھنے کے لیے ایک فروخت کار منتخب کریں</span>
          </p>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedSupply && (
        <PaymentModal
          supply={selectedSupply}
          vendor={ledgerData}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedSupply(null);
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
};

// Summary Card Component
const SummaryCard = ({ en, ur, value, color }) => {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    gray: 'bg-gray-50 border-gray-200 text-gray-900',
  };

  return (
    <div className={`card border-l-4 ${colors[color]}`}>
      <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
        <span className="en">{en}</span>
        <span className="ur">{ur}</span>
      </p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
};

// Status Badge Component
const StatusBadge = ({ status }) => {
  const statusStyles = {
    pending: 'bg-gray-100 text-gray-800',
    partial: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
  };

  const statusLabels = {
    pending: { en: 'Pending', ur: 'زیرالتوا' },
    partial: { en: 'Partial', ur: 'جزوی' },
    completed: { en: 'Paid', ur: 'ادا' },
  };

  const label = statusLabels[status] || { en: status, ur: status };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusStyles[status] || 'bg-gray-100 text-gray-800'}`}>
      <span className="en">{label.en}</span>
      <span className="ur">{label.ur}</span>
    </span>
  );
};

export default VendorLedger;
