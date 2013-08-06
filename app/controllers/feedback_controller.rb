class FeedbackController < ApplicationController

  before_filter :kick_if_not_allowed!, only: [:index, :show, :destroy]

  def new
    @feedback = Feedback.new
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

  def show
    @feedback = Feedback.find(params[:id])
  end

  def destroy
    @feedback = Feedback.find(params[:id])
    @feedback.destroy

    redirect_to :root
  end

end


