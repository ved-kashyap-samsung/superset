#supported charts
#pie = takes data and metrics(x and y)
#line chart = takes x and y
#scattered chart = takes x and y
#multiple data scattered chart = takes list of list for x and y
#bar chart = takes data and metrics(x and y)
#histogram chart = takes data(x)
#number = takes string(x)
#table = takes 2 dimensional array(x)

import matplotlib.pyplot as plt

def check_is_metric(data):
    for item in data:
        if not(isinstance(item, int)):
            return False
    return True

#steps:
#1)If number of rows is greater than 2 return table

#2)If number of rows is 2,
#if both rows are metric then line chart,
#else if number of features is less than equal to 10 then pie else bar chart

#3)If number of rows is 1,
#if number of feature in a row is 1, then big number chart
#else histogram
def find_suitable_chart_type(data):
    if(len(data)>2):
        return data, None, "table"
    elif(len(data)==2):
        is_metric_col1 = check_is_metric(data[0])
        is_metric_col2 = check_is_metric(data[1])
        if(is_metric_col1==False and is_metric_col2==False):
            #return table
            return data, None, "table"
        elif(is_metric_col1 and is_metric_col2):
            #return line chart
            return data[0], data[1], "line"
        elif(is_metric_col1):
            #can be pie chart or bar chart
            if(len(data[0])<=10):
                return data[1], data[0], "pie"
            else:
                return data[1], data[0], "bar"
        else:
            #can be pie chart or bar chart
            if(len(data[0])<=10):
                return data[0], data[1], "pie"
            else:
                return data[0], data[1], "bar"
    elif(len(data)==1):
        #can be histogram chart, number
        if(len(data[0])==1):
            return str(data[0][0]), None, "number"
        else:
            return data[0], None, "histogram"
    else:
        raise "Data has length 0, so chart cannot be made"

def plot_graph(x, y, chart_type, title, x_label=None, y_label=None):
    print(f"Plotting {chart_type} chart")

    fig = plt.figure()

    #Setting title
    plt.title(title)

    #Setting x label
    if(x_label!=None):
        plt.xlabel(x_label)

    #Setting y label
    if(y_label!=None):
        plt.xlabel(y_label)

    #Making chart
    if(chart_type=="pie"):
        plt.pie(y, labels=x, autopct='%1.1f%%', startangle=90)
        plt.axis("off")
    elif(chart_type=="line"):
        plt.plot(x, y)       
    elif(chart_type=="scattered"):
        plt.scatter(x, y)
    elif(chart_type=="multiple_scattered"):
        n = len(x)
        for i in range(0, n):
            plt.scatter(x[i], y[i])
    elif(chart_type=="bar"):
        plt.bar(x, y)
        plt.xticks(fontsize=6, rotation=90)
        plt.tight_layout()
    elif(chart_type=="histogram"):
        plt.hist(x, rwidth=0.7)
        plt.xticks(fontsize=6, rotation=90)
        plt.tight_layout()
    elif(chart_type=="number"):
        x = "The result to your query is : " + x
        plt.text(x=0.5, y=0.5, s=x, horizontalalignment='center', fontsize="xx-large", fontweight="black", fontfamily="cursive")
        plt.axis("off")
    else:
        plt.table(x, loc="center")
        plt.axis("off")
    
    return fig

def plot(data):
    x, y, chart_type = find_suitable_chart_type(data)
    return plot_graph(x, y, chart_type, "Summarization")
