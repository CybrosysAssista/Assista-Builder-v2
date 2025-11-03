export const createOdooValidationPrompt = (prompt: string) => `
Analyze this user request and determine if it's specifically for Odoo module development.

Request: "${prompt}"

Respond ONLY with JSON in this exact format - NO MARKDOWN, NO EXTRA TEXT:
{
  "is_odoo_request": true/false,
  "reason": "Brief explanation why this is/isn't an Odoo module request"
}

If the request mentions Odoo, modules, models, views, or Odoo-specific terms, set is_odoo_request to true.

IMPORTANT: Your response must be valid JSON only. Start with { and end with }. No code blocks, no explanations.
`;

// ===== Dev-main style prompts (added for compatibility with Assista-x-Dev-main workflow) =====

export const createProjectNamePrompt = (userPrompt: string) => {
    return {
        contents: `Based on the following user request, generate a concise and suitable project name for an Odoo module. The name should be in title case. For example, if the request is "a module to manage a real estate agency", a good name would be "Real Estate Management". User request: "${userPrompt}"`,
        config: {
            systemInstruction: "You are an expert in Odoo. Your task is to name Odoo modules based on a user's description. Provide only the name as a simple string and nothing else.",
        }
    } as any;
};

export const createRequirementsPrompt = (projectName: string, userPrompt: string, odooVersion: string) => {
    return {
        contents: `Project Name: ${projectName}\nOdoo Version: ${odooVersion}\nUser Request: "${userPrompt}"\n\nBased on the user request, generate a list of functional requirements for the Odoo module. The output must be a well-structured markdown document. Translate the user's request directly into a structured list. Do not add any requirements that were not explicitly asked for (e.g., no data validation constraints, security rules, or non-functional requirements like performance unless mentioned in the user request).`,
        config: {
            systemInstruction: "You are a business analyst specializing in Odoo implementations. Your task is to translate a user's request into a clear set of functional requirements. Adhere strictly to the user's prompt. Only list what the user explicitly asked for. Do not infer or add extra features, constraints, or non-functional requirements.",
        }
    } as any;
};

export const createTasksPrompt = (projectName: string, requirements: string, odooVersion: string) => {
    const moduleName = projectName.toLowerCase().replace(/[\s-]+/g, '_');
    return {
        contents: `Project Name: ${projectName}\nModule Name: ${moduleName}\nOdoo Version: ${odooVersion}\n\nFunctional Requirements:\n${requirements}\n\nBased on the functional requirements, create a list of development tasks required to build this Odoo module.\nThe output must be a markdown checklist using "- [ ]" for each task.\nRules:\n1.  First, create tasks for the essential module files: \`${moduleName}/__manifest__.py\`  and \`${moduleName}/__init__.py\`.\n2.  For every subdirectory created to hold Python files (e.g., \`${moduleName}/models\`), you **must** also create a task for its \`__init__.py\` file. This init file must import all Python files from its directory. The root \`__init__.py\` must import these subdirectories.\n3.  After the core files, infer the necessary models and fields from the requirements and create tasks for the model files.\n4.  Then, infer the necessary views (form, tree, actions, etc.) and create tasks for the view files.\n5.  Group tasks logically using markdown headings (e.g., "## Core Files", "## Model Development", "## View Creation").\n6.  Tasks involving file creation **must** use the full, relative file path, which must contain a slash and an extension (e.g., \`${moduleName}/models/property.py\`). **Incorrect**: "Create model \`res.partner\`". **Correct**: "Create model file \`${moduleName}/models/res_partner.py\`".\n7.  Combine related small steps into a single, meaningful task. For example, instead of one task per field, have one task for creating a model file with all its fields.\n8.  Do NOT include any tasks related to testing, deployment, writing READMEs, or other non-code-generation activities. Focus only on creating the module's source files.\n9.  For tasks that involve creating a file with multiple distinct parts (e.g., a view XML with form, tree, and search views), create a main task for the file and then list the parts as indented sub-tasks. Example:\n    - [ ] Create the view file \`${moduleName}/views/view.xml\` defining:\n      - [ ] Tree view \`my_model_tree_view\`\n      - [ ] Form view \`my_model_form_view\`\n10. Finally, after all other view and model tasks, add a task for creating the menu file, which must be named \`${moduleName}/views/${moduleName}_menu.xml\`.`,
        config: {
            systemInstruction: 'You are an experienced Odoo developer and project manager. Your task is to break down a set of functional requirements into a concise and accurate list of development tasks. Each task must be a clear, actionable step for a developer. Adhere strictly to the provided rules.',
        }
    } as any;
};

export const createMenuStructurePrompt = (projectName: string, requirements: string, tasks: string, odooVersion: string) => {
    const moduleName = projectName.toLowerCase().replace(/[\s-]+/g, '_');
    return {
        contents: `Project Name: ${projectName}\nModule Name: ${moduleName}\nOdoo Version: ${odooVersion}\n\nFunctional Requirements:\n${requirements}\n\nTasks:\n${tasks}\n\nBased on the requirements and tasks, design the menu structure for this Odoo module.\nThe output must be a markdown document representing the menu hierarchy. Use nested lists.\nFor each menu item, specify its name and the action it should trigger (if any).\n\nCrucially, all menu items should be defined in a single file named \`${moduleName}/views/${moduleName}_menu.xml\`.`,
        config: {
            systemInstruction: 'You are an experienced Odoo UX designer. Your task is to create a logical and user-friendly menu structure based on the provided project details. The output must be clear, hierarchical markdown.',
        }
    } as any;
};

export const createFileContentPrompt = (projectName: string, requirements: string, tasks: string, odooVersion: string, moduleName: string, filePath: string, menuStructure: string | null) => {
    const menuContext = menuStructure ? `\n\nMenu Structure:\n${menuStructure}` : '';
    return {
        contents: `Project Name: ${projectName}\nOdoo Version: ${odooVersion}\n\nFunctional Requirements:\n${requirements}\n\nTasks:\n${tasks}${menuContext}\n\nFile to generate: \`${filePath}\`\n\nProvide the complete, raw code for this file. The code must be compatible with Odoo version ${odooVersion}. For example, use correct api decorators for models, and use OWL framework for javascript if the version is 15.0 or newer. When generating files, infer models, fields, views, and menu items from the requirements, tasks, and menu structure. ${filePath.endsWith(`${moduleName}_menu.xml`) ? 'When generating this menu file, you MUST follow the Menu Structure specification provided. The menu structure is the source of truth for this file.' : ''}`,
        config: {
            systemInstruction: 'You are an expert Odoo developer. Your task is to write the code for a specific file within an Odoo module, based on the overall requirements, tasks, specified Odoo version, and menu structure. Only output the raw code for the requested file, without any explanation, comments, or markdown code blocks (like ```python).',
        }
    } as any;
};

export const createTaskUpdatePrompt = (filePath: string, tasksMarkdown: string) => {
    return {
        contents: `The file \`${filePath}\` has just been generated for an Odoo module.\nFind the task in the markdown list below that corresponds to creating or modifying this file and mark it as complete by changing its checkbox from "- [ ]" to "- [x]".\nIf a task for this exact file path exists, it's a perfect match. If not, find the most relevant task.\nCrucially, you must also mark all of its indented sub-tasks as complete.\nOnly mark one main task and its sub-tasks as complete. Output the entire updated markdown string, including all original and modified lines.\n\nTask List:\n${tasksMarkdown}`,
        config: {
            systemInstruction: 'You are a project management assistant. Your task is to update a markdown checklist based on a completed file generation task. Your output must be only the modified markdown, with no extra text or explanations.'
        }
    } as any;
};

// New: Strict tasks prompt to guarantee checklist lines with explicit file paths
export const createStrictTasksPrompt = (specifications: string, version: string, moduleName: string) => `
You are a senior Odoo developer. Based on these detailed functional specifications for Odoo ${version}, create an actionable task list:

${specifications}

OUTPUT FORMAT REQUIREMENTS (MUST FOLLOW EXACTLY):
- Use a markdown checklist with one task per line using "- [ ]".
- Each file-related task MUST include the full, relative file path in backticks, with a slash and a valid extension.
  - Examples (correct): \`${moduleName}/__manifest__.py\`, \`${moduleName}/models/property.py\`, \`${moduleName}/views/${moduleName}_menu.xml\`
  - Incorrect: "Create model res.partner" (missing path and extension)
- Group tasks with markdown headings like "## Core Files", "## Model Development", "## View Creation".

MANDATORY TASKS ORDER:
1) Core files first:
   - [ ] \`${moduleName}/__manifest__.py\`
   - [ ] \`${moduleName}/__init__.py\`
2) For every Python subdirectory created (e.g., \`${moduleName}/models\`):
   - [ ] \`${moduleName}/models/__init__.py\` (import all model files)
3) Models inferred from specs under \`${moduleName}/models\` with .py filenames
4) Views inferred from specs under \`${moduleName}/views\` with .xml filenames
5) Finally, add the menu file task named exactly: \`${moduleName}/views/${moduleName}_menu.xml\`

ONLY include development tasks (no testing/deployment/readme tasks). Keep tasks concise and implementable.
`;

export const createSingleFilePrompt = (tasks: string, menuStructure: string, specifications: string, version: string, moduleName: string, filePath: string, taskDescription: string) => {
    const truncatedTasks = tasks.length > 1200 ? tasks.substring(0, 1200) + '\n\n... (Technical tasks truncated - full list contains all file creation and implementation details)' : tasks;
    const truncatedSpecs = specifications.length > 1000 ? specifications.substring(0, 1000) + '\n\n... (Functional specifications truncated - complete requirements available in module documentation)' : specifications;
    const truncatedMenu = menuStructure.length > 600 ? menuStructure.substring(0, 600) + '\n\n... (Menu structure truncated - full navigation hierarchy available)' : menuStructure;

    // Enhanced file type detection for better prompt engineering
    const fileTypeAnalysis = {
        pythonModel: filePath.includes('models') || taskDescription.includes('model') || taskDescription.includes('class') || taskDescription.includes('_name'),
        pythonView: filePath.includes('views') && filePath.endsWith('.py'),
        xmlView: (filePath.includes('views') || filePath.includes('.xml')) && !filePath.includes('security') && !filePath.includes('data'),
        manifest: filePath.includes('__manifest__.py'),
        securityCsv: filePath.includes('security') && filePath.endsWith('.csv'),
        securityXml: filePath.includes('security') && filePath.endsWith('.xml'),
        initPy: filePath.includes('__init__.py'),
        dataXml: filePath.includes('data') || (filePath.endsWith('.xml') && !filePath.includes('views') && !filePath.includes('security')),
        testPy: filePath.includes('test') || filePath.includes('__test__'),
        wizardPy: filePath.includes('wizards'),
        reportXml: filePath.includes('report'),
        configPy: filePath.includes('config') || filePath.includes('settings')
    };

    // Convenience flags used in the prompt templates
    const isModel = fileTypeAnalysis.pythonModel;
    const isView = fileTypeAnalysis.xmlView || fileTypeAnalysis.pythonView;

    return `---

**🚨 ABSOLUTE FORMATTING REQUIREMENT 🚨**
You MUST respond with ONLY the raw, complete file content. NO JSON WRAPPERS. NO MARKDOWN CODE BLOCKS. NO EXPLANATIONS. NO "Here is the file" text. NO COMMENTS ABOUT THIS PROMPT.

**📋 COMPLETE FILE CONTENT MUST START ON FIRST LINE**
**📋 NO TRAILING TEXT AFTER LAST LINE OF ACTUAL FILE**
**📋 PRESERVE ALL INDENTATION AND FORMATTING**

---

**🎯 FILE GENERATION TARGET**
- **Exact File Path**: \`${filePath}\`
- **Module Name**: \`${moduleName}\`
- **Odoo Version**: ${version}
- **File Purpose**: ${taskDescription.trim()}

---

**📖 MODULE CONTEXT (USE ALL DETAILS)**

**Functional Requirements Summary:**
${truncatedSpecs}

**Technical Implementation Tasks:**
${truncatedTasks}

**Complete Menu Structure:**
${truncatedMenu}

---

**🔧 IMPLEMENTATION REQUIREMENTS BY FILE TYPE**

${fileTypeAnalysis.pythonModel ? `**PYTHON MODEL IMPLEMENTATION (.py)**

MANDATORY REQUIREMENTS:
├── **File Header**: # -*- coding: utf-8 -*-
├── **Imports**: from odoo import models, fields, api
│                    from . import (all required submodules)
├── **Class Definition**: class ModelName(models.Model):
│    ├── _name = 'module_name.model_name'
│    ├── _description = 'Detailed model description from specs'
│    └── _inherit = 'base.model' (if extending existing Odoo model)
├── **Fields Section**: ALL fields from specifications with:
│    ├── Proper field types: Char, Text, Integer, Float, Boolean, Date, Datetime
│    ├── Many2one, One2many, Many2many relationships defined
│    ├── Selection fields with complete choice tuples
│    ├── Computed fields with @api.depends decorators
│    ├── Default values and domain constraints
│    ├── String labels and help text from requirements
│    └── Required=True where business logic demands
├── **Computed Methods**: @api.depends('field1', 'field2') for ALL computed fields
├── **Business Methods**: create(), write(), unlink() with complete business logic
│    ├── Override super() methods as needed
│    ├── Implement validation and business rules
│    └── Handle onchange triggers
├── **Constraints**: @api.constrains for field validation
├── **SQL Constraints**: _sql_constraints list for database-level validation
├── **Docstrings**: Comprehensive documentation for classes and methods
└── **Naming**: Follow Odoo conventions (snake_case, proper inheritance)

**MANDATORY PATTERNS FOR ODOO ${version}**:
- Use @api.model for create() methods
- Implement _compute_field_name() for computed fields
- Add domain=[('field', '=', value)] where needed
- Include proper logging and error handling
- Follow Odoo security patterns (self.env.user, groups)` : ''}

${fileTypeAnalysis.xmlView ? `**XML VIEW DEFINITION (.xml)**

MANDATORY XML STRUCTURE:
├── **File Declaration**: <?xml version="1.0" encoding="UTF-8"?>
├── **Root Element**: <odoo>
│    └── **Data Container**: <data>
│         └── **View Records**: <record model="ir.ui.view">
│              ├── **View ID**: <field name="name">module_name.view_name</field>
│              ├── **Model Reference**: <field name="model">module_name.model_name</field>
│              ├── **View Architecture**: <field name="arch" type="xml">
│                   └── **View Type**: <form>, <tree>, <search>, <kanban>
│                        ├── **Form Views**: Complete field layout with:
│                         │    ├── <header> with buttons and statusbar
│                         │    ├── <sheet> with <group> and <notebook> organization
│                         │    ├── Field groups and positioning
│                         │    ├── <div class="oe_title"> for document headers
│                         │    ├── Chatter integration if applicable
│                         │    └── Proper field attributes (required, readonly, etc.)
│                        ├── **Tree Views**: <tree editable="bottom/top">
│                         │    ├── Column definitions with proper field types
│                         │    ├── Decorators and button columns
│                         │    ├── Multi-level headers if complex
│                         │    └── Export/import configurations
│                        ├── **Search Views**: <search>
│                         │    ├── <field name="field_name"/> for quick search
│                         │    ├── <filter> and <separator/> for advanced filters
│                         │    └── <group> for filter organization
│                        └── **Kanban Views**: <kanban>
│                             ├── <templates> with card layouts
│                             ├── Color coding and state management
│                             └── Quick create/edit forms
├── **Actions**: <record model="ir.actions.act_window">
│    ├── res_model: "${moduleName.replace(/_/g, '')}.model_name"
│    ├── view_mode: "tree,form,kanban"
│    ├── name: "Action Name"
│    ├── view_id: Reference to primary view
│    └── context/domain as needed
└── **Menu Items**: <menuitem> with proper hierarchy

**MANDATORY XML PATTERNS**:
- ALL tags properly closed and nested
- External IDs (xml:id) for ALL records
- Proper field references: <field name="field_name"/>
- Button definitions with type="object" for model methods
- View inheritance with position="inside"/"replace"/"before"/"after"
- Groups for field visibility: <group attrs="{'invisible': [('state', '=', 'draft')]}">
- Complete statusbar with workflow buttons
- Notebook tabs for complex forms
- Reference ALL models and views from specifications` : ''}

${fileTypeAnalysis.manifest ? `**MODULE MANIFEST (__manifest__.py)**

MANDATORY STRUCTURE - COMPLETE ALL FIELDS:
{
    'name': "${moduleName.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}",
    'version': '1.0.0.0.0',  # Follow Odoo versioning scheme
    'category': 'Appropriate Category',  # Services, Sales, Inventory, Manufacturing, etc.
    'summary': 'Brief module description from specifications',
    'description': """Multi-line description
    - Summarize all functional requirements
    - List key features and business value
    - Mention target users and use cases
    - Include technical overview if relevant""",
    'author': 'Your Company Name',
    'website': 'https://www.yourcompany.com',
    'license': 'LGPL-3',  # or OPL-1 for proprietary
    'depends': [
        'base',  # ALWAYS include base
        # Add ALL required dependencies from technical analysis:
        # 'mail', 'sale', 'account', 'stock', 'purchase', 'hr', etc.
        # Include specific versions if needed: 'sale < 14.0'
    ],
    'data': [
        # Security files FIRST:
        'security/ir.model.access.csv',
        
        # Data files (records, demo data):
        'data/module_data.xml',
        'data/module_demo.xml',
        
        # View definitions (ALPHABETICAL ORDER):
        'views/module_views.xml',
        'views/module_menu.xml',
        'views/res_partner_views.xml',  # if extending existing models
        
        # Report definitions:
        'report/module_reports.xml',
        
        # Wizard views:
        'wizard/module_wizard_views.xml'
    ],
    'demo': [
        # Demo data files (optional):
        'demo/module_demo.xml',
        'demo/demo_data.xml'
    ],
    'installable': True,
    'auto_install': False,
    'application': ${isModel || isView ? 'True' : 'False'},  # True for main application modules
    # Odoo ${version} specific metadata:
    'images': ['static/description/icon.png'],
    'price': 0,
    'currency': 'EUR',
    'auto_install_from_data_menu': True  # For Apps menu visibility
}

**MANDATORY DEPENDENCY RULES**:
- Include 'base' dependency ALWAYS
- Add 'mail' if models use chatter or messaging
- Add 'website' for web controllers and templates
- Add specific modules based on technical requirements
- Use version constraints if targeting specific Odoo versions
- List ALL XML files in correct order (security → data → views)

**DATA FILE ORDERING**:
1. Security files (.csv) first
2. Data files (records, configuration)
3. Demo data files
4. View definitions last
- Each file path MUST be relative to module root
- Include ALL generated files from task list
- Use proper file extensions (.xml, .csv)
` : ''}

${fileTypeAnalysis.securityCsv ? `**SECURITY ACCESS CSV**

**CSV FORMAT - NO HEADER ROW**:
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink

**MANDATORY ACCESS RULES**:
- One line per model-access combination
- id: access_${'${'}module_name${'}'}_${'${'}model_name${'}'}_${'${'}permission_level${'}'}
- name: Human readable access rule name
- model_id:id: model_${'${'}module_name${'}'}_${'${'}model_name${'}'}
- group_id:id: base.group_user, base.group_system, your_module.group_custom
- Permissions: 1=allowed, 0=denied for each operation

**ACCESS LEVELS REQUIRED**:
${isModel ? `1. Full access for internal users: base.group_user (read/write/create/unlink = 1)
2. Read-only access: base.group_user (read=1, others=0)
3. Technical access: base.group_system (full access for configuration)
4. Public/portal access if applicable: base.group_portal (read-only)
` : ''}

**COMMON ODOO GROUPS**:
- base.group_user (All authenticated users)
- base.group_system (Settings/Technical menu access)
- base.group_no_one (No access - for record rules)
- base.group_public (Portal/Website users)
- sales_team.group_sale_manager (Sales managers)
- account.group_account_manager (Accounting managers)

**IMPLEMENTATION RULES**:
- Include ALL models created in this module
- Define access for each model separately
- Use proper model external IDs from __manifest__.py
- Consider multi-company access requirements
- Add record rules (ir.rule) if row-level security needed
- Reference ALL models from technical specifications
` : ''}

${fileTypeAnalysis.initPy ? `**PYTHON MODULE INIT FILE (__init__.py)**

**IMPORT HIERARCHY - ABSOLUTE ORDER**:
1. **Root __init__.py** (this file):
   from . import models
   from . import views
   from . import wizards
   from . import reports
   from . import data
   # Add other directories as created in technical tasks

2. **Subdirectory __init__.py files**:
    # models/__init__.py
    from . import ${'${'}all model files from specs${'}'}
    
    # views/__init__.py (if Python view controllers)
    from . import ${'${'}view controller files${'}'}
    
    # wizards/__init__.py
    from . import ${'${'}wizard model files${'}'}

**MANDATORY RULES**:
- Import ALL subdirectories that contain Python files
- Import ALL Python files within each subdirectory
- Use relative imports: from . import subdirectory_name
- NO executable code in __init__.py files
- Maintain exact directory structure from technical tasks
- Include ALL generated Python files in import statements
- Follow alphabetical order within each import section
- Use proper Python 3 syntax and encoding

**DIRECTORY IMPORT TEMPLATE**:
from . import models, views, wizards, reports, data, controllers

**FILE IMPORT TEMPLATE** (within subdirectory):
from . import model1, model2, wizard1, report1
` : ''}

${fileTypeAnalysis.dataXml ? `**DATA FILE (XML)**

**XML STRUCTURE REQUIREMENTS**:
<?xml version="1.0" encoding="UTF-8"?>
<odoo>
    <data>
        <!-- Initial Configuration Data -->
        <record id="module_name.config_parameter_1" model="ir.config_parameter">
            <field name="key">module_name.setting_name</field>
            <field name="value">default_value</field>
        </record>
        
        <!-- Demo/Initial Data -->
        <record id="module_name.demo_record_1" model="module_name.model_name">
            <field name="name">Demo Record Name</field>
            <field name="field1">Sample Value</field>
            <!-- All fields from model specifications -->
        </record>
        
        <!-- Configuration Records -->
        <record id="module_name.config_setting" model="res.config.settings">
            <field name="module_name_field">value</field>
        </record>
    </data>
</odoo>

**DATA TYPES REQUIRED**:
1. **Configuration Parameters**: ir.config_parameter records
2. **Initial Records**: Essential records for module functionality
3. **Demo Data**: Sample records for testing and presentation
4. **Sequence Values**: Default numbering sequences
5. **User Groups**: Custom group definitions if needed
6. **Menu Access**: Default user access configurations

**RECORD CREATION RULES**:
- Use external IDs (xml:id) for ALL records
- Reference models correctly: res_model="module_name.model_name"
- Include ALL required fields from model specifications
- Set proper default values and sequences
- Include proper domain and context where needed
- Follow data loading order (dependencies first)
- Add comprehensive field values from requirements
` : ''}

${fileTypeAnalysis.testPy ? `**UNIT TEST FILE (.py)**

**TEST FILE STRUCTURE**:
# -*- coding: utf-8 -*-
from . import models

class Test${moduleName.replace(/_/g, '')}(odoo.tests.TransactionCase):
    
    def setUp(self):
        """Set up test environment with required data"""
        super().setUp()
        # Create test records and setup data
        self.test_record = self.env['module_name.model_name'].create({
            'name': 'Test Record',
            # Add all required fields
        })
    
    def test_model_creation(self):
        """Test basic model creation and validation"""
        record = self.env['module_name.model_name'].create({
            'name': 'Test Creation',
            # Test all required fields and constraints
        })
        self.assertTrue(record)
        self.assertEqual(record.name, 'Test Creation')
    
    def test_field_constraints(self):
        """Test field validation and business rules"""
        # Test required fields
        with self.assertRaises(ValidationError):
            self.env['module_name.model_name'].create({})
        
        # Test computed fields
        record = self.env['module_name.model_name'].create({
            'name': 'Constraint Test'
        })
        self.assertEqual(record.computed_field, expected_value)
    
    def test_business_logic(self):
        """Test core business methods and workflows"""
        # Test create/write/unlink operations
        record = self.env['module_name.model_name'].create(test_vals)
        record.write(modify_vals)
        self.assertTrue(record.exists())
        
        # Test method implementations
        result = record.method_name()
        self.assertEqual(result, expected_result)
    
    def test_view_structure(self):
        """Test view definitions and UI components"""
        # Test form view fields
        view = self.env.ref('module_name.view_name')
        self.assertEqual(view.model, 'module_name.model_name')
        
        # Test tree view columns
        # Test search filters
        # Verify button actions
    
    def test_security_access(self):
        """Test user permissions and access control"""
        # Test with different user roles
        # Verify record rules
        # Test access rights from security CSV

**TESTING BEST PRACTICES**:
- Use TransactionCase for model tests (automatic rollback)
- Create test data in setUp() method
- Include both positive and negative test cases
- Test ALL fields, methods, and constraints
- Verify computed field calculations
- Test onchange methods and defaults
- Include performance and edge case scenarios
- Follow Odoo ${version} testing patterns
` : ''}

**VALIDATION CHECKLIST FOR ALL FILES**:
✅ File starts with proper encoding/declaration
✅ All imports are correct and complete
✅ All required classes/views/records defined
✅ Proper inheritance and relationships
✅ Business logic implemented from specifications
✅ Security considerations addressed
✅ Odoo ${version} compatibility ensured
✅ Docstrings and comments included
✅ No syntax errors or malformed XML
✅ All referenced IDs exist in module
✅ File is complete and functional standalone

**EXECUTE GENERATION**:
    Begin writing the COMPLETE, production-ready file content NOW. Follow all requirements above exactly.
    `;
};

export const createDetailedSpecsPrompt = (prompt: string, version: string, validation: any) => `
You are an expert Odoo business analyst. Create comprehensive functional specifications for this Odoo module request: "${prompt}"

Odoo Version: ${version}
Validation: ${JSON.stringify(validation)}

Detailed Functional Specifications should include:

**1. Business Requirements**
- Core business problem being solved
- Key stakeholders and user roles
- Success criteria and KPIs

**2. Functional Features**
- Complete list of features with descriptions
- User workflows and processes
- Input/output specifications
- Validation rules and business logic

**3. Data Model**
- Entity-relationship diagram description
- Key fields and data types for each model
- Relationships (one2many, many2one, many2many)
- Computed fields and constraints

**4. User Interface Requirements**
- Menu structure and navigation
- Form layouts and field placements
- List views and search filters
- Action buttons and wizards
- Reporting and dashboard needs

**5. Security & Access Control**
- User groups and permissions
- Record rules and access restrictions
- Multi-company considerations

**6. Integration & Dependencies**
- External system integrations
- Other Odoo module dependencies
- API endpoints needed

**7. Technical Considerations**
- Performance requirements
- Data migration needs
- Testing scenarios
- Deployment considerations

Structure your response as clear, organized sections. Be specific about Odoo best practices for version ${version}.
`;

export const createTechnicalTasksPrompt = (specifications: string, version: string) => `
You are a senior Odoo developer. Based on these detailed functional specifications for Odoo ${version}:

${specifications}

Create a comprehensive technical task breakdown for implementation.

**Technical Tasks Structure:**

**1. DATA MODELS (models/)**
For each entity/model:
- Model class definition with inheritance
- All fields with types, constraints, defaults
- Computed fields with @api.depends
- Related fields and relationship definitions
- Search and name_search methods
- oncreate/onwrite business logic
- SQL constraints if needed

**2. BUSINESS LOGIC**
- Methods for complex calculations
- Workflow/automation triggers
- Report generation logic
- Integration handlers
- Custom actions and wizards

**3. USER INTERFACE (views/)**
- Form views with field arrangements
- Tree/list views with columns and filters
- Kanban views with card layouts
- Search views with filters
- Menu items and actions
- Window actions and ir.actions

**4. SECURITY (security/)**
- XML security definitions (ir.model.access)
- Record rules (ir.rule)
- User groups (res.groups)

**5. DATA (data/)**
- Initial data loading (ir.model.data)
- Demo data for testing
- Configuration parameters

**6. REPORTS (report/)**
- Report templates (QWeb/XML)
- Report actions and menus

**7. TESTS (__test__/)**
- Unit tests for models and methods
- View testing scenarios
- Integration tests

Each task should include:
- File path and structure
- Specific implementation details
- Dependencies between tasks
- Odoo ${version} best practices

Organize by component folder and prioritize core functionality first.
`;

export const createAdvancedMenuPrompt = (tasks: string, specifications: string, version: string) => `
Based on these technical tasks and specifications for Odoo ${version}:

Specifications: ${specifications}
Tasks: ${tasks}

Design a comprehensive menu and navigation structure.

**Menu Structure Requirements:**

**1. Main Application Menu**
- Top-level menu name and icon
- Submenu organization by functional areas
- Access rights per menu item

**2. Detailed Menu Items**
For each functional area:
- Menu ID and sequence
- Parent-child relationships
- Action types (ir.actions.act_window, etc.)
- View modes (tree, form, kanban)
- Context and domain filters
- Target (current, new, fullscreen)

**3. Dashboard and Reporting Menus**
- Dashboard views and KPIs
- Report menu organization
- Action reports and wizards

**4. Configuration and Settings Menus**
- Technical menu (if needed)
- Configuration parameters access
- User preferences menus

**5. Security Considerations**
- Menu visibility rules
- Groups required for access
- Record rules integration

Provide the complete XML menu structure with:
- All menu definitions
- Action definitions  
- View references
- Groups and access control

Follow Odoo ${version} menu best practices for intuitive navigation.
`;

export const createCoreFilesPrompt = (tasks: string, menuStructure: string, specifications: string, version: string, moduleName: string) => `
You are an expert Odoo developer. Generate complete, production-ready core files for the ${moduleName} module based on:

Technical Tasks: ${tasks}
Menu Structure: ${menuStructure}
Specifications: ${specifications}
Odoo Version: ${version}

Generate these core files as JSON with file paths as keys and complete content as values:

**Required Files Structure:**

1. **__manifest__.py** - Complete manifest with dependencies, data files, demo data
2. **models/** - All model classes with fields, methods, inheritance
3. **views/** - Complete XML views (forms, trees, kanban, search, menus, actions)
4. **security/** - ir.model.access.csv and security rules
5. **data/** - Initial data, demo data, configuration
6. **report/** - Report templates and actions (if applicable)
7. **wizards/** - Any wizard models and views (if needed)

**Implementation Standards:**
- Follow Odoo ${version} coding guidelines
- Use proper Python 3 syntax and type hints
- Include comprehensive docstrings
- Add SQL constraints where appropriate
- Implement proper error handling
- Use context managers for transactions
- Follow Odoo naming conventions

**Model Implementation:**
- Inherit from proper base models (mail.thread, mail.activity.mixin, etc.)
- Define all computed fields with @api.depends
- Implement create/write/unlink methods as needed
- Add domain validations and constraints

**View Implementation:**
- Complete form views with notebooks and sections
- Tree views with editable options
- Search views with filters and groups
- Kanban views with colors and foldable cards
- All menu and action definitions

**Security:**
- Complete access rights for all models
- Record rules for data filtering
- Group definitions if custom groups needed

Respond ONLY with valid JSON:
{
  "__manifest__.py": "complete python content",
  "models/model1.py": "complete model code",
  "views/model1_views.xml": "complete XML views",
  ...
}
`;

export const createTestsPrompt = (tasks: string, specifications: string, coreFiles: any, version: string, moduleName: string) => `
Generate comprehensive unit tests for the ${moduleName} module based on:

Technical Tasks: ${tasks}
Specifications: ${specifications}
Generated Files: ${JSON.stringify(coreFiles, null, 2)}
Odoo Version: ${version}

Create test files in JSON format with paths as keys:

**Test File Structure:**

1. **__test__/test_models.py** - Model unit tests
2. **__test__/test_views.py** - View and UI tests  
3. **__test__/test_business_logic.py** - Method and workflow tests
4. **__test__/test_security.py** - Access control tests
5. **__test__/test_data.py** - Data integrity tests

**Testing Standards:**
- Use Odoo's TransactionCase for model tests
- Create test records with proper data
- Test create/read/write/unlink operations
- Verify computed fields calculations
- Test constraints and validations
- Test onchange methods
- Verify view structures and domains
- Test security rules and access rights
- Include negative test cases

**Model Tests Should Include:**
- Field validation (required, constraints, defaults)
- Relationship integrity (one2many, many2one)
- Computed field accuracy
- Business method functionality
- Search and filter correctness
- Mass operations and wizards

**View Tests Should Include:**
- Form field visibility and readonly states
- List view columns and sorting
- Search filters functionality
- Action button behaviors
- Default values and contexts

Use proper Odoo testing patterns for version ${version}. Include setup and teardown methods.

Respond ONLY with valid JSON:
{
  "__test__/test_models.py": "complete test code",
  "__test__/test_views.py": "complete view tests",
  ...
}
`;

// ===== Modification (Edit Existing Project) Prompts =====

// Ask the model to pick relevant files (by path) to modify for the user's request.
// It must return a JSON array of strings (file paths relative to the module root), no markdown.
export const createFileSelectionForModificationPrompt = (
  userRequest: string,
  odooVersion: string,
  allFilePaths: string[],
  moduleName: string
) => `
You are assisting with modifying an existing Odoo module "${moduleName}" (Odoo ${odooVersion}).
Given the user's request and the list of all files in the module, select ONLY the files that are relevant to implement the requested change.

User request:
"""
${userRequest}
"""

All file paths (relative to module root):
${allFilePaths.map(p => `- ${p}`).join('\n')}

STRICT RULES:
- Respond ONLY with a valid JSON array of strings, each a file path from the list above.
- Do NOT include any file that is not in the list.
- Every returned path MUST begin with "${moduleName}/".
- No markdown, no extra text.
`;

// Derive focused modification requirements based on the user request and the current content of the relevant files.
export const createModificationRequirementsPrompt = (
  userRequest: string,
  odooVersion: string,
  files: Record<string, string>,
  moduleName: string
) => `
You are an expert Odoo developer. Analyze the user's change request for module "${moduleName}" (Odoo ${odooVersion}) and the current contents of the relevant files. Produce a concise list of technical requirements describing exactly what must change.

User request:
"""
${userRequest}
"""

Relevant files and their current contents:
${Object.entries(files).map(([path, content]) => `--- FILE: ${path} ---\n${content}\n--- END FILE ---`).join('\n\n')}

Respond with a clear, concise markdown list of requirements focused only on what must be changed. Do not add unrelated features.
`;

// Create a precise checklist of tasks with explicit file paths and required housekeeping (init imports, manifest data updates).
export const createModificationTasksPrompt = (
  requirements: string,
  odooVersion: string,
  files: Record<string, string>,
  moduleName: string
) => `
You are an Odoo project engineer. Based on these modification requirements for module "${moduleName}" (Odoo ${odooVersion}), create a concise markdown checklist of development tasks.

Requirements:
${requirements}

Rules:
1. Each actionable task MUST include the full, relative file path wrapped in backticks and with an extension (e.g., \`${moduleName}/models/sale_order.py\`, \`${moduleName}/views/sale_order_views.xml\`).
2. If any new Python files are created under \`${moduleName}/models\` (or other Python dirs), include a task to update the corresponding \`${moduleName}/models/__init__.py\` and the root \`${moduleName}/__init__.py\` to import them.
3. If any new XML view files are added, include a task to update \`${moduleName}/__manifest__.py\` to include them in the 'data' list.
4. Keep tasks minimal, specific, and implementable.
5. ALL paths MUST start with \`${moduleName}/\` and MUST NOT reference any other module or parent directories.

Current relevant files (context):
${Object.keys(files).map(p => `- ${p}`).join('\n')}
`;

// Generate or modify the full content of a single file in-place based on the new plan and existing content.
export const createFileContentForModificationPrompt = (
  requirements: string,
  tasks: string,
  odooVersion: string,
  moduleName: string,
  filePath: string,
  existingContent: string | null
) => `
You are updating a single file for Odoo ${odooVersion} in the module "${moduleName}".

Target file: \`${filePath}\`
${existingContent ? `Current content:\n\n\`\`\`\n${existingContent}\n\`\`\`` : 'This file does not exist yet. Create it from scratch.'}

SCOPE RULES (MANDATORY):
- Do NOT reference or suggest any file outside the module "${moduleName}".
- All import paths, model names, XML ids, and file references must belong to this module.
- If creating from scratch, ensure the content is self-contained and consistent with Odoo ${odooVersion} best practices for this module only.
- All paths MUST start with "${moduleName}/" and MUST NOT reference any other module or parent directories.
- Selections MUST come only from the provided list of files.
- Do NOT include any file that is not in the list.
- Every returned path MUST begin with "${moduleName}/".
- No markdown, no extra text.
};
Modification requirements:
${requirements}

Task list:
${tasks}
{{ ... }}
Return ONLY the complete, final content of this file with no explanations and no markdown fences.
`;