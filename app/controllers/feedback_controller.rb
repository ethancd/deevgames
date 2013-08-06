class FeedbackController < ApplicationController

  before_filter :auth_only!, only: [:index, :show, :destroy]

  def new
    @feedback = Feedback.new(topic: "Site Design")
  end

  def create
    @feedback = Feedback.create(params[:feedback])

    if @feedback.save
      redirect_to :root
    else
      render :new
    end
  end

  def index
    @feedback = Feedback.order("id desc").page(params[:page]).per(10)
  end

  def destroy
    @feedback = Feedback.find(params[:id])
    @feedback.destroy

    redirect_to feedback_index_url
  end

end


