// Sale Mobile Page - Step-by-step sales process with on-the-fly customer creation
import React, { useState, useEffect } from 'react';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import BilingualInput from '../components/BilingualInput';
import BackButton from '../components/BackButton';
import Modal from '../components/Modal';
import { partiesAPI, mobileAPI, transactionsAPI } from '../services/api';

const SaleMobile = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  // Form Data
  const [formData, setFormData] = useState({
    customer_id: '',
    mobile_id: '',
    selling_price: '',
    payment_method: 'cash',
    amount_paid: '',
    notes: '',
  });

  // New Customer Form
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    whatsapp: '',
    address: '',
    city: '',
    cnic: '',
    notes: '',
  });

  // Dropdowns Data
  const [customers, setCustomers] = useState([]);
  const [mobiles, setMobiles] = useState([]);
  const [selectedMobile, setSelectedMobile] = useState(null);

  // Load customers and mobiles on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [customersRes, mobilesRes] = await Promise.all([
        partiesAPI.getCustomers(),
        mobileAPI.getAll(), // Get all mobiles, filter on frontend
      ]);

      if (customersRes.success) {
        setCustomers(customersRes.data || []);
      }

      if (mobilesRes.success) {
        // Filter mobiles that are not sold and transform data for display
        const availableMobiles = (mobilesRes.data || [])
          .filter(m => !m.is_sold) // Only show mobiles that haven't been sold
          .map(mobile => ({
            ...mobile,
            brand_name: mobile.model?.brand?.name || 'Unknown',
            model_name: mobile.model?.model_name || 'Unknown',
            condition: mobile.condition,
          }));
        setMobiles(availableMobiles);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Auto-populate selling price if mobile is selected
    if (field === 'mobile_id') {
      const mobile = mobiles.find(m => m.id.toString() === value);
      if (mobile) {
        setSelectedMobile(mobile);
        setFormData((prev) => ({ ...prev, selling_price: mobile.sale_price }));
      }
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) {
      setError('Name and phone are required');
      return;
    }

    setLoading(true);
    try {
      const res = await partiesAPI.create({
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email || null,
        whatsapp: newCustomer.whatsapp || null,
        address: newCustomer.address || null,
        city: newCustomer.city || null,
        cnic: newCustomer.cnic || null,
        notes: newCustomer.notes || null,
        type: 'CUSTOMER',
        is_active: true,
      });

      if (res.success) {
        setCustomers([...customers, res.data]);
        setFormData((prev) => ({ ...prev, customer_id: res.data.id.toString() }));
        setShowAddCustomerModal(false);
        setNewCustomer({
          name: '',
          phone: '',
          email: '',
          whatsapp: '',
          address: '',
          city: '',
          cnic: '',
          notes: '',
        });
        setSuccess('Customer added successfully!');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || 'Failed to add customer');
      }
    } catch (err) {
      setError(err.message || 'Failed to add customer');
    } finally {
      setLoading(false);
    }
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        return formData.customer_id;
      case 2:
        return formData.mobile_id && formData.selling_price;
      case 3:
        return formData.payment_method && formData.amount_paid;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
      setError(null);
    } else {
      setError('Please complete all required fields');
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) {
      setError('Invalid data. Please review all steps.');
      return;
    }

    setLoading(true);
    try {
      const res = await transactionsAPI.quickSale(
        parseInt(formData.customer_id),
        parseInt(formData.mobile_id),
        parseFloat(formData.selling_price),
        parseFloat(formData.amount_paid), // Amount customer actually paid
        formData.payment_method, // Payment method (cash, card, cheque)
        new Date().toISOString().split('T')[0],
        formData.notes
      );

      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        setError(res.error || 'Failed to complete sale');
      }
    } catch (err) {
      setError(err.message || 'Failed to complete sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Back Button */}
      <div className="mb-6">
        <BackButton fallbackPath="/" />
      </div>

      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Sale Mobile"
          ur="موبائل فروخت"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
        <p className="text-gray-600 mt-2">Complete the sale in 4 simple steps</p>
      </div>

      {/* Alerts */}
      {error && (
        <BilingualAlert
          en={error}
          ur={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}
      {success && (
        <BilingualAlert
          en="Sale completed successfully! Redirecting..."
          ur="فروخت کامیابی سے مکمل ہو گئی!"
          type="success"
          onClose={() => setSuccess(false)}
        />
      )}

      {/* Progress Indicator */}
      <div className="mb-8">
        <StepProgressIndicator currentStep={currentStep} totalSteps={4} />
      </div>

      {/* Step Content */}
      <div className="card max-w-2xl">
        {currentStep === 1 && (
          <Step1CustomerSelection
            formData={formData}
            customers={customers}
            onInputChange={handleInputChange}
            onAddNew={() => setShowAddCustomerModal(true)}
          />
        )}
        {currentStep === 2 && (
          <Step2MobileSelection
            formData={formData}
            mobiles={mobiles}
            onInputChange={handleInputChange}
          />
        )}
        {currentStep === 3 && (
          <Step3PaymentDetails
            formData={formData}
            onInputChange={handleInputChange}
          />
        )}
        {currentStep === 4 && (
          <Step4Summary
            formData={formData}
            customers={customers}
            selectedMobile={selectedMobile}
          />
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-4 mt-8">
          <BilingualButton
            en="Back"
            ur="پیچھے"
            variant="secondary"
            size="md"
            onClick={handleBack}
            disabled={currentStep === 1}
          />

          {currentStep < 4 ? (
            <BilingualButton
              en="Next"
              ur="اگلا"
              variant="primary"
              size="md"
              onClick={handleNext}
              loading={loading}
            />
          ) : (
            <BilingualButton
              en="Complete Sale"
              ur="فروخت مکمل کریں"
              variant="success"
              size="md"
              onClick={handleSubmit}
              loading={loading}
            />
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      <Modal
        isOpen={showAddCustomerModal}
        title="Add New Customer"
        subtitle="Create a new customer to proceed with sale"
        onClose={() => setShowAddCustomerModal(false)}
        size="lg"
      >
        <div className="space-y-4">
          <BilingualInput
            en="Name"
            ur="نام"
            type="text"
            value={newCustomer.name}
            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            required={true}
            icon="👤"
          />
          <BilingualInput
            en="Phone"
            ur="فون"
            type="tel"
            value={newCustomer.phone}
            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            required={true}
            icon="📱"
          />
          <BilingualInput
            en="Email"
            ur="ای میل"
            type="email"
            value={newCustomer.email}
            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
            icon="📧"
          />
          <BilingualInput
            en="WhatsApp"
            ur="واٹس ایپ"
            type="tel"
            value={newCustomer.whatsapp}
            onChange={(e) => setNewCustomer({ ...newCustomer, whatsapp: e.target.value })}
            icon="💬"
          />
          <BilingualInput
            en="Address"
            ur="پتہ"
            type="text"
            value={newCustomer.address}
            onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
            icon="🏠"
          />
          <BilingualInput
            en="City"
            ur="شہر"
            type="text"
            value={newCustomer.city}
            onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
            icon="🏙️"
          />
          <BilingualInput
            en="CNIC"
            ur="CNIC"
            type="text"
            value={newCustomer.cnic}
            onChange={(e) => setNewCustomer({ ...newCustomer, cnic: e.target.value })}
            icon="🆔"
          />
          <BilingualInput
            en="Notes"
            ur="نوٹس"
            type="text"
            value={newCustomer.notes}
            onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
            icon="📝"
          />

          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setShowAddCustomerModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCustomer}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {loading ? 'Adding...' : 'Add Customer'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Step 1: Customer Selection
const Step1CustomerSelection = ({ formData, customers, onInputChange, onAddNew }) => {
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Select Customer"
        ur="کسٹمر منتخب کریں"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div>
        <BilingualLabel
          en="Search or select customer"
          ur="کسٹمر تلاش یا منتخب کریں"
          size="md"
          bold={true}
          className="mb-2"
        />
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 mb-3"
        />
        <select
          value={formData.customer_id}
          onChange={(e) => onInputChange('customer_id', e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="">-- Select a customer --</option>
          {filteredCustomers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} ({customer.phone}) - Credit: Rs. {customer.credit_balance || 0}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 border-t border-gray-300"></div>
        <span className="text-gray-600 text-sm">OR</span>
        <div className="flex-1 border-t border-gray-300"></div>
      </div>

      <button
        onClick={onAddNew}
        className="w-full px-4 py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors font-semibold"
      >
        + Add New Customer
      </button>
    </div>
  );
};

// Step 2: Mobile Selection
const Step2MobileSelection = ({ formData, mobiles, onInputChange }) => {
  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Select Mobile to Sell"
        ur="فروخت کے لیے موبائل منتخب کریں"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div className="space-y-3">
        {mobiles.length === 0 ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
            <p>No mobiles available for sale in inventory</p>
          </div>
        ) : (
          <>
            <select
              value={formData.mobile_id}
              onChange={(e) => onInputChange('mobile_id', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">-- Select a mobile --</option>
              {mobiles.map((mobile) => (
                <option key={mobile.id} value={mobile.id}>
                  ID: {mobile.id} | {mobile.brand_name} {mobile.model_name} | {mobile.condition} |
                  IMEI: {mobile.imei1 || 'N/A'} | Rs. {mobile.sale_price?.toLocaleString('en-PK')}
                </option>
              ))}
            </select>

            {mobiles.length > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <p>📱 Total available: {mobiles.length} units</p>
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <BilingualInput
          en="Selling Price (Rs.)"
          ur="فروخت کی قیمت (روپے)"
          type="number"
          value={formData.selling_price}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '' || parseFloat(val) >= 0) {
              onInputChange('selling_price', val);
            }
          }}
          required={true}
          placeholder="0"
        />
        {formData.selling_price && parseFloat(formData.selling_price) < 0 && (
          <p className="text-red-600 text-sm mt-1">⚠️ Selling price cannot be negative</p>
        )}
      </div>
    </div>
  );
};

// Step 3: Payment Details
const Step3PaymentDetails = ({ formData, onInputChange }) => {
  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Payment Details"
        ur="ادائیگی کی تفصیلات"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div>
        <BilingualLabel
          en="Payment Method"
          ur="ادائیگی کا طریقہ"
          size="md"
          bold={true}
          className="mb-2"
        />
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'cash', en: 'Cash', ur: 'نقد' },
            { value: 'card', en: 'Card', ur: 'کارڈ' },
            { value: 'cheque', en: 'Cheque', ur: 'چیک' },
          ].map((method) => (
            <button
              key={method.value}
              onClick={() => onInputChange('payment_method', method.value)}
              className={`p-3 rounded-lg border-2 transition-all cursor-pointer text-center ${
                formData.payment_method === method.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900">{method.en}</div>
              <div className="text-xs text-gray-600" style={{ fontFamily: 'Noto Nastaliq Urdu, serif' }}>
                {method.ur}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <BilingualInput
          en="Amount Paid (Rs.)"
          ur="ادا کی گئی رقم (روپے)"
          type="number"
          value={formData.amount_paid}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '' || parseFloat(val) >= 0) {
              onInputChange('amount_paid', val);
            }
          }}
          required={true}
          placeholder="0"
        />
        {formData.amount_paid && parseFloat(formData.amount_paid) < 0 && (
          <p className="text-red-600 text-sm mt-1">⚠️ Amount paid cannot be negative</p>
        )}
      </div>

      <BilingualInput
        en="Notes (Optional)"
        ur="نوٹس (اختیاری)"
        type="text"
        value={formData.notes}
        onChange={(e) => onInputChange('notes', e.target.value)}
      />
    </div>
  );
};

// Step 4: Summary
const Step4Summary = ({ formData, customers, selectedMobile }) => {
  const customer = customers.find((c) => c.id.toString() === formData.customer_id);
  const sellingPrice = parseFloat(formData.selling_price) || 0;
  const amountPaid = parseFloat(formData.amount_paid) || 0;
  const remaining = sellingPrice - amountPaid;

  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Sale Summary"
        ur="فروخت کا خلاصہ"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div className="space-y-4">
        {/* Customer Info */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <BilingualLabel
            en="Customer"
            ur="کسٹمر"
            size="md"
            bold={true}
            className="mb-2"
          />
          <p className="text-gray-900">{customer?.name}</p>
          <p className="text-sm text-gray-600">{customer?.phone}</p>
        </div>

        {/* Mobile Info */}
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <BilingualLabel
            en="Mobile"
            ur="موبائل"
            size="md"
            bold={true}
            className="mb-2"
          />
          <p className="text-gray-900">
            {selectedMobile?.brand_name} {selectedMobile?.model_name}
          </p>
          <p className="text-sm text-gray-600">
            Condition: {selectedMobile?.condition}
          </p>
        </div>

        {/* Payment Summary */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">
              <span className="font-semibold">Selling Price:</span>
            </span>
            <span className="font-semibold">Rs. {sellingPrice.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">
              <span className="font-semibold">Amount Paid:</span>
            </span>
            <span className="font-semibold">Rs. {amountPaid.toLocaleString()}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="text-gray-900">
              <span className="font-semibold">Remaining:</span>
            </span>
            <span className={`font-bold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
              Rs. {Math.abs(remaining).toLocaleString()}
              {remaining > 0 && ' (Credit)'}
              {remaining < 0 && ' (Refund)'}
            </span>
          </div>
        </div>

        {/* Payment Method */}
        <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-gray-900">
            <span className="font-semibold">Payment Method:</span>{' '}
            {formData.payment_method.toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
};

// Step Progress Indicator Component
const StepProgressIndicator = ({ currentStep, totalSteps }) => {
  const steps = [
    { num: 1, en: 'Customer', ur: 'کسٹمر' },
    { num: 2, en: 'Mobile', ur: 'موبائل' },
    { num: 3, en: 'Payment', ur: 'ادائیگی' },
    { num: 4, en: 'Summary', ur: 'خلاصہ' },
  ];

  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => (
        <React.Fragment key={step.num}>
          {/* Step Circle */}
          <div
            className={`flex flex-col items-center gap-1 ${
              step.num <= currentStep ? 'opacity-100' : 'opacity-50'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white transition-all ${
                step.num === currentStep
                  ? 'bg-blue-600 ring-2 ring-blue-300'
                  : step.num < currentStep
                  ? 'bg-green-600'
                  : 'bg-gray-300'
              }`}
            >
              {step.num < currentStep ? '✓' : step.num}
            </div>
            <div className="text-xs font-semibold text-gray-700 text-center">
              {step.en}
            </div>
            <div
              className="text-xs text-gray-600 text-center"
              style={{ fontFamily: 'Noto Nastaliq Urdu, serif' }}
            >
              {step.ur}
            </div>
          </div>

          {/* Connector Line */}
          {index < steps.length - 1 && (
            <div
              className={`flex-1 h-1 mx-2 transition-all ${
                step.num < currentStep ? 'bg-green-600' : 'bg-gray-300'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default SaleMobile;
