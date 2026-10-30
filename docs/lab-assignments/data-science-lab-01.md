# Data Science Lab 1
## Iris Data Analysis and Flower Classification

**Level:** Beginner  
**Suggested duration:** 3 hours  
**Total marks:** 20  
**Student name:** ____________________  **Student ID:** ____________________

### Project task

Download a dataset from Kaggle and complete a small data science project. Explore and prepare the data, create visualizations, build a simple classification model, and explain your results using evidence. Your final work should show how flower measurements help distinguish iris species.

### Dataset

Use **Iris Species**, published by UCI Machine Learning on Kaggle:

https://www.kaggle.com/datasets/uciml/iris

Download and extract **Iris.csv**. The dataset contains 150 flowers across three species, with 50 observations per species. It includes an identifier, four measurements in centimetres, and a species label.

| Column | Meaning | Role |
| --- | --- | --- |
| Id | Record identifier | Exclude from analysis features |
| SepalLengthCm | Sepal length | Numeric feature |
| SepalWidthCm | Sepal width | Numeric feature |
| PetalLengthCm | Petal length | Numeric feature |
| PetalWidthCm | Petal width | Numeric feature |
| Species | Iris species | Classification target |

Record the dataset URL, download date, and file used in your notebook. Verify the actual file dimensions rather than assuming they match the description.

### Research questions

1. How do average flower measurements differ between species?
2. Which measurements appear most useful for separating species?
3. Can a simple model predict species better than a majority-class baseline?

### Tools

Use Python in Google Colab or Jupyter Notebook with pandas, matplotlib or seaborn, and scikit-learn. Basic notebook and Python familiarity is assumed.

### Required activities

**1 Load and inspect the data**

Load the CSV with pandas. Display the first five rows, dataset dimensions, column types, and species counts. State which columns are features and which is the target. Remove `Id` from the model inputs.

**2 Check data quality**

Count missing values, duplicate rows, and unexpected species labels. Check that measurements are numeric and positive. Explain any corrections. Identical measurements can represent different flowers, so do not automatically remove records just because their feature values match. Do not invent missing values or cleaning operations when none are needed.

**3 Perform descriptive analysis**

Calculate the mean, median, standard deviation, minimum, and maximum for the four measurements. Calculate mean measurements by species. Identify the strongest absolute correlation between two measurement columns. Do not include `Id` in this correlation calculation.

**4 Create three visualizations**

- A bar chart showing the number of flowers in each species.
- A scatter plot of petal length against petal width, coloured by species.
- A box plot of petal length grouped by species.

Give every chart a title, labelled axes, and units where relevant. Write one or two sentences below each chart explaining the observation it supports.

**5 Build and evaluate a model**

Predict `Species` using the four measurements. Make an 80 percent training and 20 percent test split with `random_state=42` and stratification by species. This should produce 120 training and 30 test observations if all 150 records are retained.

Train a majority-class baseline using `DummyClassifier(strategy="most_frequent")`. Then train a pipeline containing `StandardScaler` and `LogisticRegression(max_iter=1000)`. Fit the scaler and model on the training data only. If imputation is needed, include it inside the pipeline so it also learns from training data only.

For both models, report test accuracy. For logistic regression, also include a labelled confusion matrix and precision, recall, and F1-score for each species. Keep the test set out of model fitting and tuning. Exploratory charts are descriptive evidence, not independent proof of model accuracy.

**6 Explain the results**

Answer the three research questions. Support your discussion with at least three numerical findings and references to your charts. Compare the model with the baseline and describe any misclassified flowers. If no test examples are misclassified, report that accurately. Explain why a small, single-split experiment does not establish performance on all future flowers. Correlation alone does not prove causation.

### Results to include

Complete this table using outputs from your own notebook. Do not copy expected accuracy figures from online examples.

| Result | Your finding |
| --- | --- |
| Rows and feature columns retained | ____________________ |
| Missing values and duplicate observations | ____________________ |
| Species with the greatest mean petal length | ____________________ |
| Strongest measurement correlation and coefficient | ____________________ |
| Baseline test accuracy | ____________________ |
| Logistic regression test accuracy | ____________________ |
| Number and types of classification errors | ____________________ |

### Submission

Submit one notebook named **StudentID_Lab01.ipynb** and a **2 to 3 page PDF report**. The notebook must run from top to bottom and show its outputs. Include the dataset source and loading instructions so another person can reproduce the work.

Organize the report as: project objective, dataset and preparation, descriptive results and charts, model evaluation, and conclusion with limitations. Include your completed results table. State one practical lesson learned from the project.

### Assessment

| Criterion | Marks |
| --- | ---: |
| Dataset sourcing and inspection | 3 |
| Data quality checks and justified preparation | 3 |
| Descriptive analysis and three readable charts | 5 |
| Correct train and test workflow and model evaluation | 5 |
| Evidence-based conclusions and reproducibility | 4 |
| **Total** | **20** |

### Completion checklist

- [ ] Dataset source and download date recorded.
- [ ] Data quality checks documented.
- [ ] Three charts created and interpreted.
- [ ] Identifier excluded and preprocessing fitted on training data only.
- [ ] Baseline and model results reported from the held-out test set.
- [ ] Research questions answered with calculated evidence.
- [ ] Notebook rerun successfully and report exported.

### Reference

UCI Machine Learning. *Iris Species*. Kaggle. https://www.kaggle.com/datasets/uciml/iris. Dataset description consulted 30 October 2026.
