// Unified Purchase Device - Source Selection Gateway
import React from 'react';
import { useNavigate } from 'react-router-dom';
import BilingualLabel from '../components/BilingualLabel';

const PurchaseDevice = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Purchase Device"
          ur="ڈیوائس خریداری"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
        <p className="text-gray-600 mt-2">Choose where you want to purchase the device from</p>
      </div>

      {/* Source Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl">
        {/* Purchase from Supplier */}
        <div
          onClick={() => navigate('/add-mobile')}
          className="card cursor-pointer hover:shadow-lg hover:border-blue-500 transition-all transform hover:-translate-y-1"
        >
          <div className="text-center">
            <div className="text-6xl mb-4">🏢</div>
            <BilingualLabel
              en="Add Stock"
              ur="سٹاک شامل کریں"
              size="lg"
              bold={true}
              className="mb-4"
            />
            <p className="text-gray-700 text-sm font-medium mb-2">
              Purchase from Supplier/Vendor
            </p>
            <p className="text-gray-600 text-xs mb-6">
              Add new devices purchased directly from suppliers or vendors.
            </p>

            <div className="text-left bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200">
              <p className="text-xs font-semibold text-gray-700 mb-2">What you'll enter:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>✓ Supplier details</li>
                <li>✓ Brand & Model</li>
                <li>✓ IMEI number</li>
                <li>✓ Purchase & selling price</li>
                <li>✓ Storage & Color</li>
              </ul>
            </div>

            <button
              onClick={() => navigate('/add-mobile')}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              Continue →
            </button>
          </div>
        </div>

        {/* Purchase from Customer (Trade-in) */}
        <div
          onClick={() => navigate('/trade-in-purchase')}
          className="card cursor-pointer hover:shadow-lg hover:border-green-500 transition-all transform hover:-translate-y-1"
        >
          <div className="text-center">
            <div className="text-6xl mb-4">👤</div>
            <BilingualLabel
              en="Trade-in"
              ur="ٹریڈ ان"
              size="lg"
              bold={true}
              className="mb-4"
            />
            <p className="text-gray-700 text-sm font-medium mb-2">
              Purchase from Customer
            </p>
            <p className="text-gray-600 text-xs mb-6">
              Buy used devices from customers with CNIC and photo verification.
            </p>

            <div className="text-left bg-green-50 p-4 rounded-lg mb-6 border border-green-200">
              <p className="text-xs font-semibold text-gray-700 mb-2">What you'll enter:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>✓ Customer details</li>
                <li>✓ CNIC number & photo</li>
                <li>✓ Device photos (angles)</li>
                <li>✓ Brand, Model & IMEIs</li>
                <li>✓ Condition & PTA status</li>
              </ul>
            </div>

            <button
              onClick={() => navigate('/trade-in-purchase')}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
            >
              Continue →
            </button>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="max-w-3xl mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-gray-700">
          <span className="font-semibold">💡 Tip:</span> Choose "Add Stock" for vendor purchases (no CNIC needed) and "Trade-in" for customer purchases (CNIC and photos required).
        </p>
      </div>
    </div>
  );
};

export default PurchaseDevice;
