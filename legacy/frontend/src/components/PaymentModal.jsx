// Payment Modal - Record payment against a supply/purchase
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import BilingualLabel from './BilingualLabel';
import BilingualButton from './BilingualButton';
import BilingualInput from './BilingualInput';
import { suppliesAPI } from '../services/api';

const PaymentModal = ({ supply, vendor, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    payment_amount: '',
    payment_method: 'cash',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.payment_amount) {
      setError('Please enter payment amount');
      return;
    }

    const amount = parseFloat(formData.payment_amount);
    if (amount <= 0) {
      setError('Payment amount must be greater than 0');
      return;
    }

    if (amount > supply.credit_amount) {
      setError(`Payment amount cannot exceed outstanding balance (Rs. ${supply.credit_amount})`);
      return;
    }

    try {
      setLoading(true);
      const result = await suppliesAPI.recordPayment(supply.id, {
        payment_amount: amount,
        payment_method: formData.payment_method,
        notes: formData.notes || null,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Failed to record payment');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="bg-blue-50 border-b-2 border-blue-300 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">
            <span className="en">Record Payment</span>
            <span className="ur">ادائیگی ریکارڈ کریں</span>
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Vendor Info */}
          {vendor && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                <span className="en">Vendor</span>
                <span className="ur">فروخت کار</span>
              </p>
              <p className="font-semibold text-gray-900">{vendor.vendor_name}</p>
            </div>
          )}

          {/* Supply Details */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                  <span className="en">Total Amount</span>
                  <span className="ur">کل رقم</span>
                </p>
                <p className="font-semibold text-gray-900 ltr">
                  Rs. {supply.total_amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                  <span className="en">Already Paid</span>
                  <span className="ur">پہلے ادا کی گئی</span>
                </p>
                <p className="font-semibold text-green-700 ltr">
                  Rs. {supply.amount_paid.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
                  <span className="en">Outstanding Balance</span>
                  <span className="ur">باقی رقم</span>
                </p>
                <p className="text-2xl font-bold text-red-700 ltr">
                  Rs. {supply.credit_amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Payment Amount */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <span className="en">Payment Amount *</span>
                <span className="ur">ادائیگی کی رقم *</span>
              </label>
              <input
                type="number"
                name="payment_amount"
                value={formData.payment_amount}
                onChange={handleInputChange}
                placeholder="0"
                max={supply.credit_amount}
                min={0}
                step={0.01}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">
                <span className="en">Max: Rs. {supply.credit_amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</span>
                <span className="ur">زیادہ سے زیادہ: Rs. {supply.credit_amount.toLocaleString('en-PK', { maximumFractionDigits: 0 })}</span>
              </p>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <span className="en">Payment Method</span>
                <span className="ur">ادائیگی کا طریقہ</span>
              </label>
              <select
                name="payment_method"
                value={formData.payment_method}
                onChange={handleInputChange}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="cash">
                  <span className="en">Cash</span>
                </option>
                <option value="bank_transfer">
                  <span className="en">Bank Transfer</span>
                </option>
                <option value="check">
                  <span className="en">Check</span>
                </option>
                <option value="online">
                  <span className="en">Online Payment</span>
                </option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <span className="en">Notes (Optional)</span>
                <span className="ur">نوٹس (اختیاری)</span>
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                placeholder="Any additional notes..."
                disabled={loading}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <span className="en">Cancel</span>
                <span className="ur">منسوخ کریں</span>
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="en">Processing...</span>
                    <span className="ur">جاری ہے...</span>
                  </>
                ) : (
                  <>
                    <span className="en">Record Payment</span>
                    <span className="ur">ادائیگی ریکارڈ کریں</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Date/Time Info */}
          <div className="mt-4 text-xs text-gray-500 text-center">
            <span className="en">Payment will be recorded at:</span>
            <span className="ur">ادائیگی یہاں ریکارڈ کی جائے گی:</span>
            <br />
            {new Date().toLocaleString('en-PK')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
