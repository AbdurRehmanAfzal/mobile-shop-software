// Add Mobile Page - Step-by-step inventory entry form
import React, { useState, useEffect } from 'react';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import BilingualInput from '../components/BilingualInput';
import Modal from '../components/Modal';
import { brandsAPI, modelsAPI, mobileAPI, partiesAPI, storageAPI, colorAPI } from '../services/api';

const AddMobile = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Modal states
  const [showAddBrandModal, setShowAddBrandModal] = useState(false);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);

  // Optional fields visibility
  const [showImei3, setShowImei3] = useState(false);
  const [showSerialNumber, setShowSerialNumber] = useState(false);

  // Form Data
  const [formData, setFormData] = useState({
    brand_id: '',
    model_id: '',
    // Multiple IMEI support
    imei1: '',
    imei2: '',
    imei3: '',
    // Serial Number and PTA Status
    serial_number: '',
    pta_status: 'PTA',  // PTA or NON_PTA
    sim_time: '',  // For non-PTA phones
    // Storage and Color (IDs)
    storage_id: '',
    color_id: '',
    condition: '', // new, patched, used
    patch_details: {
      has_screen_issue: false,
      has_battery_issue: false,
      has_back_issue: false,
      has_camera_issue: false,
      has_face_id_issue: false,
    },
    condition_quality: '', // GOOD, AVERAGE, POOR
    cost_price: '',
    selling_price: '',
    supplier_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
  });

  // New Brand Form
  const [newBrand, setNewBrand] = useState({
    name: '',
    name_urdu: '',
  });

  // New Model Form
  const [newModel, setNewModel] = useState({
    brand_id: '',
    model_name: '',
    model_name_urdu: '',
    original_price: '',
    sale_price: '',
  });

  // New Supplier Form
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    email: '',
    whatsapp: '',
    address: '',
    city: '',
    type: 'VENDOR', // VENDOR or TRADE_IN
  });

  // Dropdowns Data
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [storages, setStorages] = useState([]);
  const [colors, setColors] = useState([]);

  // Load brands, suppliers, storages, and colors on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  // Load models when brand changes
  useEffect(() => {
    if (formData.brand_id) {
      loadModelsByBrand();
    }
  }, [formData.brand_id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [brandsRes, suppliersRes, storagesRes, colorsRes] = await Promise.all([
        brandsAPI.getAll(),
        partiesAPI.getSuppliers(),
        storageAPI.getAll(),
        colorAPI.getAll(),
      ]);

      if (brandsRes.success) setBrands(brandsRes.data || []);
      if (suppliersRes.success) setSuppliers(suppliersRes.data || []);
      if (storagesRes.success) setStorages(storagesRes.data || []);
      if (colorsRes.success) setColors(colorsRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadModelsByBrand = async () => {
    try {
      const res = await modelsAPI.getByBrand(formData.brand_id);
      if (res.success) {
        setModels(res.data || []);
        // Reset model selection when brand changes
        setFormData((prev) => ({ ...prev, model_id: '' }));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePatchDetailChange = (field) => {
    setFormData((prev) => ({
      ...prev,
      patch_details: {
        ...prev.patch_details,
        [field]: !prev.patch_details[field],
      },
    }));
  };

  const handleAddBrand = async () => {
    if (!newBrand.name) {
      setError('Brand name is required');
      return;
    }

    setLoading(true);
    try {
      const res = await brandsAPI.create({
        name: newBrand.name,
        name_urdu: newBrand.name_urdu || null,
      });

      if (res.success) {
        setBrands([...brands, res.data]);
        setFormData((prev) => ({ ...prev, brand_id: res.data.id.toString() }));
        setShowAddBrandModal(false);
        setNewBrand({
          name: '',
          name_urdu: '',
        });
        setSuccess('Brand added successfully!');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || 'Failed to add brand');
      }
    } catch (err) {
      setError(err.message || 'Failed to add brand');
    } finally {
      setLoading(false);
    }
  };

  const handleAddModel = async () => {
    if (!newModel.model_name) {
      setError('Model name is required');
      return;
    }

    if (!newModel.brand_id) {
      setError('Please select a brand for the model');
      return;
    }

    if (!newModel.sale_price) {
      setError('Sale price is required');
      return;
    }

    setLoading(true);
    try {
      const res = await modelsAPI.create({
        brand_id: parseInt(newModel.brand_id),
        model_name: newModel.model_name,
        model_name_urdu: newModel.model_name_urdu || null,
        original_price: newModel.original_price ? parseFloat(newModel.original_price) : null,
        sale_price: parseFloat(newModel.sale_price),
      });

      if (res.success) {
        // If the new model belongs to the currently selected brand, add it to models list
        if (newModel.brand_id === formData.brand_id) {
          setModels([...models, res.data]);
        }
        setFormData((prev) => ({
          ...prev,
          brand_id: newModel.brand_id,
          model_id: res.data.id.toString()
        }));
        setShowAddModelModal(false);
        setNewModel({
          brand_id: '',
          model_name: '',
          model_name_urdu: '',
          original_price: '',
          sale_price: '',
        });
        setSuccess('Model added successfully!');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || 'Failed to add model');
      }
    } catch (err) {
      setError(err.message || 'Failed to add model');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.name || !newSupplier.phone) {
      setError('Name and phone are required');
      return;
    }

    setLoading(true);
    try {
      const res = await partiesAPI.create({
        name: newSupplier.name,
        phone: newSupplier.phone,
        email: newSupplier.email || null,
        whatsapp: newSupplier.whatsapp || null,
        address: newSupplier.address || null,
        city: newSupplier.city || null,
        type: newSupplier.type,
        is_active: true,
      });

      if (res.success) {
        setSuppliers([...suppliers, res.data]);
        setFormData((prev) => ({ ...prev, supplier_id: res.data.id.toString() }));
        setShowAddSupplierModal(false);
        setNewSupplier({
          name: '',
          phone: '',
          email: '',
          whatsapp: '',
          address: '',
          city: '',
          type: 'VENDOR',
        });
        setSuccess('Supplier added successfully!');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || 'Failed to add supplier');
      }
    } catch (err) {
      setError(err.message || 'Failed to add supplier');
    } finally {
      setLoading(false);
    }
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        return formData.brand_id && formData.model_id;
      case 2:
        // At least IMEI 1 is needed, and storage/color are required
        const hasImei = formData.imei1; // IMEI 1 is primary
        const hasStorage = formData.storage_id;
        const hasColor = formData.color_id;
        // If NON_PTA, must have SIM time selected
        const ptaValid = formData.pta_status === 'PTA' || (formData.pta_status === 'NON_PTA' && formData.sim_time);
        return hasImei && hasStorage && hasColor && ptaValid;
      case 3:
        return formData.condition;
      case 4:
        if (formData.condition === 'patched') {
          return Object.values(formData.patch_details).some((v) => v);
        }
        if (formData.condition === 'used') {
          return formData.condition_quality;
        }
        return true;
      case 5:
        return (
          formData.cost_price &&
          formData.selling_price &&
          formData.supplier_id &&
          formData.purchase_date
        );
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
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
    if (!validateStep(5)) {
      setError('Please complete all required fields');
      return;
    }

    setLoading(true);
    try {
      // Only send fields that the backend schema expects
      const storageObj = storages.find(s => s.id == formData.storage_id);
      const colorObj = colors.find(c => c.id == formData.color_id);

      const mobileData = {
        model_id: parseInt(formData.model_id),
        storage_id: formData.storage_id ? parseInt(formData.storage_id) : null,
        color_id: formData.color_id ? parseInt(formData.color_id) : null,
        condition: formData.condition,
        cost_price: parseFloat(formData.cost_price),
        sale_price: parseFloat(formData.selling_price),
        // Multiple IMEI support
        imei1: formData.imei1 || null,
        imei2: formData.imei2 || null,
        imei3: formData.imei3 || null,
        // Serial Number and PTA Status
        serial_number: formData.serial_number || null,
        pta_status: formData.pta_status,
        sim_time: formData.sim_time || null,
        batch_number: null,
        notes: `Storage: ${storageObj?.name || 'N/A'}, Color: ${colorObj?.name || 'N/A'}, Supplier: ${formData.supplier_id}, Date: ${formData.purchase_date}` +
          (formData.condition === 'patched'
            ? `, Issues: ${JSON.stringify(formData.patch_details)}`
            : formData.condition === 'used'
            ? `, Quality: ${formData.condition_quality}`
            : ''),
      };

      const res = await mobileAPI.add(mobileData);
      if (res.success) {
        setSuccess(true);
        // Reset form after 2 seconds
        setTimeout(() => {
          setFormData({
            brand_id: '',
            model_id: '',
            // Multiple IMEI support
            imei1: '',
            imei2: '',
            imei3: '',
            // Serial Number and PTA Status
            serial_number: '',
            pta_status: 'PTA',
            sim_time: '',
            // Storage and Color (IDs)
            storage_id: '',
            color_id: '',
            condition: '',
            patch_details: {
              has_screen_issue: false,
              has_battery_issue: false,
              has_back_issue: false,
              has_camera_issue: false,
              has_face_id_issue: false,
            },
            condition_quality: '',
            cost_price: '',
            selling_price: '',
            supplier_id: '',
            purchase_date: new Date().toISOString().split('T')[0],
          });
          setCurrentStep(1);
          setSuccess(false);
        }, 2000);
      } else {
        setError(res.error || 'Failed to add mobile');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Add Mobile to Inventory"
          ur="موبائل انوینٹری میں شامل کریں"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
      </div>

      {/* Success Alert */}
      {success && (
        <BilingualAlert
          en={typeof success === 'string' ? success : "Mobile added successfully!"}
          ur={typeof success === 'string' ? success : "موبائل کامیابی سے شامل ہو گیا!"}
          type="success"
          autoClose={false}
        />
      )}

      {/* Error Alert */}
      {error && (
        <BilingualAlert
          en={error}
          ur={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}

      {/* Debug Info */}
      {loading && (
        <BilingualAlert
          en={`Loading... Storages: ${storages.length}, Colors: ${colors.length}`}
          ur={`لوڈ ہو رہا ہے... اسٹوریج: ${storages.length}, رنگ: ${colors.length}`}
          type="info"
        />
      )}

      {/* Step Progress Indicator */}
      <div className="mb-8">
        <StepProgressIndicator currentStep={currentStep} totalSteps={5} />
      </div>

      {/* Form Container */}
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        {/* Step 1: Brand & Model Selection */}
        {currentStep === 1 && (
          <Step1BrandModel
            formData={formData}
            brands={brands}
            models={models}
            onInputChange={handleInputChange}
            onAddNewBrand={() => setShowAddBrandModal(true)}
            onAddNewModel={() => {
              // Pre-fill brand_id in new model form if a brand is already selected
              if (formData.brand_id) {
                setNewModel((prev) => ({ ...prev, brand_id: formData.brand_id }));
              }
              setShowAddModelModal(true);
            }}
          />
        )}

        {/* Step 2: Device Details */}
        {currentStep === 2 && (
          <>
            {storages.length === 0 || colors.length === 0 ? (
              <BilingualAlert
                en={`⏳ Loading... Storages loaded: ${storages.length}, Colors loaded: ${colors.length}`}
                ur={`⏳ لوڈ ہو رہا ہے... اسٹوریج لوڈ شدہ: ${storages.length}, رنگ لوڈ شدہ: ${colors.length}`}
                type="info"
              />
            ) : (
              <BilingualAlert
                en={`✓ Ready! ${storages.length} storage options and ${colors.length} color options available`}
                ur={`✓ تیار ہے! ${storages.length} اسٹوریج کے اختیارات اور ${colors.length} رنگ دستیاب ہیں`}
                type="success"
              />
            )}
            <Step2DeviceDetails
              formData={formData}
              onInputChange={handleInputChange}
              storages={storages}
              colors={colors}
              showImei3={showImei3}
              setShowImei3={setShowImei3}
              showSerialNumber={showSerialNumber}
              setShowSerialNumber={setShowSerialNumber}
            />
          </>
        )}

        {/* Step 3: Condition Selection */}
        {currentStep === 3 && (
          <Step3Condition formData={formData} onInputChange={handleInputChange} />
        )}

        {/* Step 4: Condition Details */}
        {currentStep === 4 && (
          <Step4ConditionDetails
            formData={formData}
            onInputChange={handleInputChange}
            onPatchDetailChange={handlePatchDetailChange}
          />
        )}

        {/* Step 5: Prices & Supplier */}
        {currentStep === 5 && (
          <Step5PricesSupplier
            formData={formData}
            suppliers={suppliers}
            onInputChange={handleInputChange}
            onAddNewSupplier={() => setShowAddSupplierModal(true)}
          />
        )}

        {/* Navigation Buttons */}
        <div className="mt-8 flex gap-4 justify-between">
          <BilingualButton
            en="Back"
            ur="پیچھے"
            variant="secondary"
            size="md"
            onClick={handleBack}
            disabled={currentStep === 1}
          />

          {currentStep < 5 ? (
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
              en="Add Mobile"
              ur="موبائل شامل کریں"
              variant="success"
              size="md"
              onClick={handleSubmit}
              loading={loading}
            />
          )}
        </div>
      </div>

      {/* Add Brand Modal */}
      <Modal
        isOpen={showAddBrandModal}
        title="Add New Brand"
        subtitle="Create a new brand to add to inventory"
        onClose={() => setShowAddBrandModal(false)}
        size="md"
      >
        <div className="space-y-4">
          <BilingualInput
            en="Brand Name"
            ur="برانڈ کا نام"
            type="text"
            value={newBrand.name}
            onChange={(e) => setNewBrand({ ...newBrand, name: e.target.value })}
            required={true}
            icon="🏢"
          />
          <BilingualInput
            en="Brand Name (Urdu)"
            ur="برانڈ کا نام (اردو)"
            type="text"
            value={newBrand.name_urdu}
            onChange={(e) => setNewBrand({ ...newBrand, name_urdu: e.target.value })}
            icon="📝"
          />

          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setShowAddBrandModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddBrand}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {loading ? 'Adding...' : 'Add Brand'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Model Modal */}
      <Modal
        isOpen={showAddModelModal}
        title="Add New Model"
        subtitle="Create a new model to add to inventory"
        onClose={() => setShowAddModelModal(false)}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <BilingualLabel en="Brand" ur="برانڈ" size="md" bold={true} className="mb-2" />
            <select
              value={newModel.brand_id}
              onChange={(e) => setNewModel({ ...newModel, brand_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <BilingualInput
            en="Model Name"
            ur="ماڈل کا نام"
            type="text"
            value={newModel.model_name}
            onChange={(e) => setNewModel({ ...newModel, model_name: e.target.value })}
            required={true}
            icon="📱"
          />

          <BilingualInput
            en="Model Name (Urdu)"
            ur="ماڈل کا نام (اردو)"
            type="text"
            value={newModel.model_name_urdu}
            onChange={(e) => setNewModel({ ...newModel, model_name_urdu: e.target.value })}
            icon="📝"
          />

          <BilingualInput
            en="Original Price (Rs.)"
            ur="اصل قیمت (روپے)"
            type="number"
            value={newModel.original_price}
            onChange={(e) => setNewModel({ ...newModel, original_price: e.target.value })}
            icon="💰"
          />

          <BilingualInput
            en="Sale Price (Rs.)"
            ur="فروخت کی قیمت (روپے)"
            type="number"
            value={newModel.sale_price}
            onChange={(e) => setNewModel({ ...newModel, sale_price: e.target.value })}
            required={true}
            icon="💵"
          />

          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setShowAddModelModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddModel}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {loading ? 'Adding...' : 'Add Model'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Supplier Modal */}
      <Modal
        isOpen={showAddSupplierModal}
        title="Add New Supplier"
        subtitle="Create a new supplier (Vendor or Trade-in)"
        onClose={() => setShowAddSupplierModal(false)}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <BilingualLabel en="Supplier Type" ur="سپلائی کار کی قسم" size="md" bold={true} className="mb-2" />
            <select
              value={newSupplier.type}
              onChange={(e) => setNewSupplier({ ...newSupplier, type: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="VENDOR">Vendor (موبائل فروخت کار)</option>
              <option value="TRADE_IN">Trade-in (اپنے موبائل بیچنے والے)</option>
            </select>
          </div>

          <BilingualInput
            en="Name"
            ur="نام"
            type="text"
            value={newSupplier.name}
            onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            required={true}
            icon="👤"
          />

          <BilingualInput
            en="Phone"
            ur="فون"
            type="text"
            value={newSupplier.phone}
            onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
            required={true}
            icon="📱"
          />

          <BilingualInput
            en="Email"
            ur="ای میل"
            type="email"
            value={newSupplier.email}
            onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
            icon="📧"
          />

          <BilingualInput
            en="WhatsApp"
            ur="واٹس ایپ"
            type="text"
            value={newSupplier.whatsapp}
            onChange={(e) => setNewSupplier({ ...newSupplier, whatsapp: e.target.value })}
            icon="💬"
          />

          <BilingualInput
            en="Address"
            ur="پتہ"
            type="text"
            value={newSupplier.address}
            onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
            icon="📍"
          />

          <BilingualInput
            en="City"
            ur="شہر"
            type="text"
            value={newSupplier.city}
            onChange={(e) => setNewSupplier({ ...newSupplier, city: e.target.value })}
            icon="🏙️"
          />

          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setShowAddSupplierModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSupplier}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400"
            >
              {loading ? 'Adding...' : 'Add Supplier'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Step 1: Brand & Model Selection
const Step1BrandModel = ({ formData, brands, models, onInputChange, onAddNewBrand, onAddNewModel }) => {
  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Select Brand and Model"
        ur="برانڈ اور ماڈل منتخب کریں"
        size="lg"
        bold={true}
        className="mb-4"
      />

      {/* Brand Selection */}
      <div>
        <BilingualLabel en="Brand" ur="برانڈ" size="md" bold={true} className="mb-2" />
        <select
          value={formData.brand_id}
          onChange={(e) => onInputChange('brand_id', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Brand</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      {/* Add New Brand Button */}
      <button
        onClick={onAddNewBrand}
        className="w-full px-4 py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors font-semibold"
      >
        + Add New Brand
      </button>

      {/* Model Selection */}
      <div>
        <BilingualLabel en="Model" ur="ماڈل" size="md" bold={true} className="mb-2" />
        <select
          value={formData.model_id}
          onChange={(e) => onInputChange('model_id', e.target.value)}
          disabled={!formData.brand_id}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        >
          <option value="">Select Model</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.model_name}
            </option>
          ))}
        </select>
      </div>

      {/* Add New Model Button */}
      <button
        onClick={onAddNewModel}
        className="w-full px-4 py-3 border-2 border-dashed border-green-300 rounded-lg text-green-600 hover:bg-green-50 transition-colors font-semibold"
      >
        + Add New Model
      </button>
    </div>
  );
};

// Step 2: Device Details
const Step2DeviceDetails = ({ formData, onInputChange, storages, colors, showImei3, setShowImei3, showSerialNumber, setShowSerialNumber }) => {
  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Device Details"
        ur="ڈیوائس کی تفصیلات"
        size="lg"
        bold={true}
        className="mb-4"
      />

      {/* IMEI Numbers Section */}
      <div className="bg-blue-50 p-4 rounded-lg mb-4 border-l-4 border-blue-500">
        <BilingualLabel en="IMEI Numbers" ur="IMEI نمبرز" bold={true} />
        <p className="text-xs text-gray-600 mb-3">Most phones have 2 IMEIs (Primary & Secondary)</p>

        <BilingualInput
          en="IMEI 1 (Primary)"
          ur="IMEI 1 (بنیادی)"
          type="text"
          value={formData.imei1}
          onChange={(e) => onInputChange('imei1', e.target.value)}
          placeholder="e.g., 865123456789012"
          icon="📱"
        />

        <BilingualInput
          en="IMEI 2 (Secondary)"
          ur="IMEI 2 (ثانوی)"
          type="text"
          value={formData.imei2}
          onChange={(e) => onInputChange('imei2', e.target.value)}
          placeholder="e.g., 865123456789013"
          icon="📱"
        />

        {/* Checkbox to show/hide IMEI 3 */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-blue-200">
          <input
            type="checkbox"
            id="showImei3"
            checked={showImei3}
            onChange={(e) => {
              setShowImei3(e.target.checked);
              if (!e.target.checked) {
                onInputChange('imei3', ''); // Clear IMEI 3 if hiding it
              }
            }}
            className="w-4 h-4 cursor-pointer"
          />
          <label htmlFor="showImei3" className="text-sm text-gray-700 cursor-pointer">
            ✓ Add 3rd IMEI? (Optional)
          </label>
        </div>

        {/* Show IMEI 3 only if checkbox is checked */}
        {showImei3 && (
          <BilingualInput
            en="IMEI 3 (Optional)"
            ur="IMEI 3 (اختیاری)"
            type="text"
            value={formData.imei3}
            onChange={(e) => onInputChange('imei3', e.target.value)}
            placeholder="For devices with 3 IMEIs"
            icon="📱"
          />
        )}
      </div>

      {/* Serial Number Section - Hidden by default with checkbox */}
      <div className="bg-gray-50 p-4 rounded-lg mb-4 border-l-4 border-gray-400">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showSerialNumber"
            checked={showSerialNumber}
            onChange={(e) => {
              setShowSerialNumber(e.target.checked);
              if (!e.target.checked) {
                onInputChange('serial_number', ''); // Clear serial number if hiding it
              }
            }}
            className="w-4 h-4 cursor-pointer"
          />
          <label htmlFor="showSerialNumber" className="text-sm text-gray-700 cursor-pointer">
            ✓ Add Serial Number? (Optional)
          </label>
        </div>

        {/* Show Serial Number field only if checkbox is checked */}
        {showSerialNumber && (
          <div className="mt-4">
            <BilingualInput
              en="Serial Number"
              ur="سیریل نمبر"
              type="text"
              value={formData.serial_number}
              onChange={(e) => onInputChange('serial_number', e.target.value)}
              placeholder="For shopkeeper records"
              icon="🏷️"
            />
            <p className="text-xs text-gray-600 mt-2">Device serial number or reference code for your records</p>
          </div>
        )}
      </div>

      {/* PTA Status Section */}
      <div className="bg-green-50 p-4 rounded-lg mb-4 border-l-4 border-green-500">
        <BilingualLabel en="PTA Status" ur="PTA کی حالت" bold={true} />
        <p className="text-xs text-gray-600 mb-3">Is this phone PTA (Pakistan Telecom Authority) approved?</p>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pta_status"
              value="PTA"
              checked={formData.pta_status === 'PTA'}
              onChange={(e) => {
                onInputChange('pta_status', e.target.value);
                onInputChange('sim_time', ''); // Clear SIM time when switching to PTA
              }}
              className="w-4 h-4"
            />
            <span className="text-green-700 font-semibold">✓ PTA Approved</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pta_status"
              value="NON_PTA"
              checked={formData.pta_status === 'NON_PTA'}
              onChange={(e) => onInputChange('pta_status', e.target.value)}
              className="w-4 h-4"
            />
            <span className="text-orange-700 font-semibold">✗ Non-PTA</span>
          </label>
        </div>
      </div>

      {/* SIM Time for Non-PTA (Conditional) */}
      {formData.pta_status === 'NON_PTA' && (
        <div className="bg-orange-50 p-4 rounded-lg mb-4 border-l-4 border-orange-500">
          <BilingualLabel en="SIM Time Duration" ur="SIM کی مدت" bold={true} />
          <p className="text-xs text-gray-600 mb-3">Allowed SIM usage period for non-PTA phones</p>

          <select
            value={formData.sim_time}
            onChange={(e) => onInputChange('sim_time', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Select SIM Duration...</option>
            <option value="1 month">1 Month</option>
            <option value="3 months">3 Months</option>
            <option value="6 months">6 Months</option>
            <option value="12 months">12 Months</option>
            <option value="Limited (Check Details)">Limited (Check Details)</option>
          </select>
        </div>
      )}

      {/* Storage Selection */}
      <div>
        <BilingualLabel en="Storage (GB) *" ur="اسٹوریج (GB) *" size="md" bold={true} className="mb-2" />
        <select
          value={formData.storage_id}
          onChange={(e) => onInputChange('storage_id', e.target.value)}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            !formData.storage_id ? 'border-red-300 bg-red-50' : 'border-gray-300'
          }`}
          required
        >
          <option value="">
            {storages.length === 0 ? 'Loading storages...' : 'Select Storage (Required)'}
          </option>
          {storages.map((storage) => (
            <option key={storage.id} value={storage.id}>
              {storage.name}
            </option>
          ))}
        </select>
        {!formData.storage_id && (
          <p className="text-red-600 text-sm mt-1">Storage selection is required</p>
        )}
      </div>

      {/* Color Selection */}
      <div>
        <BilingualLabel en="Color *" ur="رنگ *" size="md" bold={true} className="mb-2" />
        <select
          value={formData.color_id}
          onChange={(e) => onInputChange('color_id', e.target.value)}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            !formData.color_id ? 'border-red-300 bg-red-50' : 'border-gray-300'
          }`}
          required
        >
          <option value="">
            {colors.length === 0 ? 'Loading colors...' : 'Select Color (Required)'}
          </option>
          {colors.map((color) => (
            <option key={color.id} value={color.id}>
              {color.name}
            </option>
          ))}
        </select>
        {!formData.color_id && (
          <p className="text-red-600 text-sm mt-1">Color selection is required</p>
        )}
      </div>
    </div>
  );
};

// Step 3: Condition Selection
const Step3Condition = ({ formData, onInputChange }) => {
  const conditions = [
    { value: 'new', en: 'Box Pack', ur: 'بکس پیک' },
    { value: 'patched', en: 'Patched', ur: 'مرمت شدہ' },
    { value: 'used', en: 'Used', ur: 'استعمال شدہ' },
  ];

  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Select Device Condition"
        ur="ڈیوائس کی حالت منتخب کریں"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {conditions.map((cond) => (
          <button
            key={cond.value}
            onClick={() => onInputChange('condition', cond.value)}
            className={`p-6 rounded-lg border-2 transition-all cursor-pointer text-center ${
              formData.condition === cond.value
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-4xl mb-3">
              {cond.value === 'new' && '📦'}
              {cond.value === 'patched' && '🔧'}
              {cond.value === 'used' && '♻️'}
            </div>
            <div className="font-semibold text-gray-900">{cond.en}</div>
            <div className="text-sm text-gray-600" style={{ fontFamily: 'Noto Nastaliq Urdu, serif' }}>
              {cond.ur}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// Step 4: Condition Details
const Step4ConditionDetails = ({
  formData,
  onInputChange,
  onPatchDetailChange,
}) => {
  if (formData.condition === 'new') {
    return (
      <div className="space-y-6">
        <BilingualLabel
          en="Device in Original Box"
          ur="ڈیوائس اصل ڈبے میں"
          size="lg"
          bold={true}
          className="mb-4"
        />
        <div className="p-6 bg-green-50 rounded-lg border border-green-200">
          <p className="text-green-900 font-semibold">✅ No issues to report</p>
        </div>
      </div>
    );
  }

  if (formData.condition === 'patched') {
    return (
      <div className="space-y-6">
        <BilingualLabel
          en="Issues Fixed"
          ur="مرمت شدہ مسائل"
          size="lg"
          bold={true}
          className="mb-4"
        />

        <div className="space-y-3">
          {[
            { key: 'has_screen_issue', en: 'Screen', ur: 'سکرین' },
            { key: 'has_battery_issue', en: 'Battery', ur: 'بیٹری' },
            { key: 'has_back_issue', en: 'Back Panel', ur: 'پچھلا پینل' },
            { key: 'has_camera_issue', en: 'Camera', ur: 'کیمرہ' },
            { key: 'has_face_id_issue', en: 'Face ID', ur: 'فیس ID' },
          ].map((issue) => (
            <label
              key={issue.key}
              className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={formData.patch_details[issue.key]}
                onChange={() => onPatchDetailChange(issue.key)}
                className="w-5 h-5"
              />
              <div>
                <div className="font-semibold text-gray-900">{issue.en}</div>
                <div className="text-sm text-gray-600" style={{ fontFamily: 'Noto Nastaliq Urdu, serif' }}>
                  {issue.ur}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (formData.condition === 'used') {
    return (
      <div className="space-y-6">
        <BilingualLabel
          en="Select Quality"
          ur="معیار منتخب کریں"
          size="lg"
          bold={true}
          className="mb-4"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { value: 'GOOD', en: 'Good', ur: 'اچھا' },
            { value: 'AVERAGE', en: 'Average', ur: 'درمیانی' },
            { value: 'POOR', en: 'Poor', ur: 'برا' },
          ].map((quality) => (
            <button
              key={quality.value}
              onClick={() => onInputChange('condition_quality', quality.value)}
              className={`p-4 rounded-lg border-2 transition-all cursor-pointer text-center ${
                formData.condition_quality === quality.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900">{quality.en}</div>
              <div className="text-sm text-gray-600" style={{ fontFamily: 'Noto Nastaliq Urdu, serif' }}>
                {quality.ur}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

// Step 5: Prices & Supplier
const Step5PricesSupplier = ({ formData, suppliers, onInputChange, onAddNewSupplier }) => {
  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Prices & Supplier"
        ur="قیمتیں اور سپلائی کار"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <BilingualInput
        en="Cost Price (Rs.)"
        ur="لاگت کی قیمت (روپے)"
        type="number"
        value={formData.cost_price}
        onChange={(e) => onInputChange('cost_price', e.target.value)}
        required={true}
        icon="💰"
      />

      <BilingualInput
        en="Selling Price (Rs.)"
        ur="فروخت کی قیمت (روپے)"
        type="number"
        value={formData.selling_price}
        onChange={(e) => onInputChange('selling_price', e.target.value)}
        required={true}
        icon="💵"
      />

      {formData.cost_price && formData.selling_price && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-gray-600">
            Profit: Rs. {(parseFloat(formData.selling_price) - parseFloat(formData.cost_price)).toLocaleString()}
          </p>
        </div>
      )}

      <div>
        <BilingualLabel
          en="Supplier"
          ur="سپلائی کار"
          size="md"
          bold={true}
          className="mb-2"
        />
        <select
          value={formData.supplier_id}
          onChange={(e) => onInputChange('supplier_id', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Supplier</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={onAddNewSupplier}
        className="w-full px-4 py-3 border-2 border-dashed border-purple-300 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors font-semibold"
      >
        + Add New Supplier
      </button>

      <BilingualInput
        en="Purchase Date"
        ur="خریداری کی تاریخ"
        type="date"
        value={formData.purchase_date}
        onChange={(e) => onInputChange('purchase_date', e.target.value)}
        required={true}
      />
    </div>
  );
};

// Step Progress Indicator Component
const StepProgressIndicator = ({ currentStep, totalSteps }) => {
  const steps = [
    { num: 1, en: 'Brand', ur: 'برانڈ' },
    { num: 2, en: 'Details', ur: 'تفصیلات' },
    { num: 3, en: 'Condition', ur: 'حالت' },
    { num: 4, en: 'Repair', ur: 'مرمت' },
    { num: 5, en: 'Price', ur: 'قیمت' },
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

export default AddMobile;
